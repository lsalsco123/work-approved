import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { PermitData } from "./types";

export type PermitStatus = "draft" | "submitted" | "approved" | "rejected" | "completed";
export type ChainStage = "manager" | "safety" | "factory" | "done";

export interface ChainEntry { by?: string; comment?: string; at?: string }
export interface ChainRejected { stage?: string; by?: string; reason?: string; at?: string }
export interface PermitChain {
  manager?: ChainEntry; safety?: ChainEntry; factory?: ChainEntry; rejected?: ChainRejected | null;
}

export interface PermitRecord {
  id: string;
  status: PermitStatus;
  stage?: ChainStage;
  chain?: PermitChain;
  createdBy: string;
  createdByEmail: string;
  company: string;
  submittedAt: Timestamp | null;
  updatedAt: Timestamp;
  createdAt: Timestamp;
  data: PermitData;
  adminNote?: string;
  approvedBy?: string;
}

// 결재 액션(승인/반려/재상신) — 서버(chainAction)가 역할·단계 검증
export async function chainAction(
  permitId: string, action: "approve" | "reject" | "resubmit", comment = "", reviewerName = "",
  signature = "",
): Promise<{ stage?: ChainStage; status?: PermitStatus }> {
  const fn = httpsCallable<
    { permitId: string; action: string; comment: string; reviewerName: string; signature: string },
    { stage?: ChainStage; status?: PermitStatus }
  >(functions, "chainAction");
  const res = await fn({ permitId, action, comment, reviewerName, signature });
  return res.data;
}

const COL = "permits";

export async function savePermit(
  uid: string, email: string, company: string, data: PermitData, id?: string
): Promise<string> {
  if (id) {
    await updateDoc(doc(db, COL, id), { data, updatedAt: serverTimestamp() });
    return id;
  }
  const ref = await addDoc(collection(db, COL), {
    status: "draft", createdBy: uid, createdByEmail: email, company,
    submittedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), data,
  });
  return ref.id;
}

export async function submitPermit(id: string): Promise<void> {
  // (재)제출 시 결재 단계를 manager 로 초기화하고 이전 결재 이력(chain)을 비운다.
  await updateDoc(doc(db, COL, id), {
    status: "submitted", stage: "manager", chain: {},
    submittedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function approvePermit(id: string, approverName: string): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    status: "approved", approvedBy: approverName,
    approvedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function rejectPermit(id: string, note: string): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    status: "rejected", adminNote: note, updatedAt: serverTimestamp(),
  });
}

export async function completePermit(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { status: "completed", updatedAt: serverTimestamp() });
}

// 관리자 확인(원형 ●) + 검토자 저장 — confirmed 배열과 검토자(환경안전)만 갱신
export async function saveAdminFields(id: string, confirmed: string[], reviewName: string): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    "data.confirmed": confirmed,
    "data.admin.review.name": reviewName,
    "data.admin.review.dept": "환경안전",
    updatedAt: serverTimestamp(),
  });
}

export async function getPermit(id: string): Promise<PermitRecord | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as PermitRecord;
}

export async function listMyPermits(uid: string): Promise<PermitRecord[]> {
  const q = query(collection(db, COL), where("createdBy", "==", uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PermitRecord));
}

export async function listAllPermits(max = 1000): Promise<PermitRecord[]> {
  const q = query(collection(db, COL), orderBy("createdAt", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PermitRecord));
}

// 관리자(결재라인) 본인 관련 건. requester=본인이 담당자인 건만 / safety·factory=전체(초안 제외).
// requester 는 단일 equality 쿼리(복합 인덱스 불필요) 후 클라이언트 정렬.
export async function listChainPermits(
  managerKind: string, managerName: string, max = 1000,
): Promise<PermitRecord[]> {
  let docs;
  if (managerKind === "requester") {
    const q = query(collection(db, COL), where("data.manager", "==", managerName), limit(max));
    docs = (await getDocs(q)).docs;
  } else {
    // 공장장(factory): 자기 차례(stage=factory) + 완료(approved/completed)만 — rules 와 일치
    const [s1, s2] = await Promise.all([
      getDocs(query(collection(db, COL), where("stage", "==", "factory"), limit(max))),
      getDocs(query(collection(db, COL), where("status", "in", ["approved", "completed"]), limit(max))),
    ]);
    const seen = new Set<string>();
    docs = [...s1.docs, ...s2.docs].filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
  }
  return docs
    .map((d) => ({ id: d.id, ...d.data() } as PermitRecord))
    .filter((p) => p.status !== "draft")
    .sort((a, b) => {
      const ta = (a.submittedAt as { seconds?: number })?.seconds ?? 0;
      const tb = (b.submittedAt as { seconds?: number })?.seconds ?? 0;
      return tb - ta;
    });
}
