import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, functions, storage } from "./firebase";
import { PermitData } from "./types";
import { PermitAttachment } from "./attachments";

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
  attachments?: PermitAttachment[];
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

// 첨부 Storage 객체도 best-effort 로 함께 정리한다 — 그렇지 않으면 permit 문서 삭제 후
// 고아(orphan) 파일이 Storage 에 남는다. Storage rules 상 삭제는 업로더 본인 uid 경로만
// 허용하므로(첨부는 다른 사람이 올렸을 수도 있음), 현재 호출자가 지울 수 있는 것만 지우고
// 나머지는 조용히 건너뛴다 — 문서 삭제 자체를 이 정리 실패로 막지 않는다.
export async function deletePermit(id: string): Promise<void> {
  try {
    const snap = await getDoc(doc(db, COL, id));
    const atts = (snap.exists() && (snap.data() as PermitRecord).attachments) || [];
    await Promise.all(
      atts.map((a) => deleteObject(ref(storage, a.path)).catch(() => {})),
    );
  } catch { /* 첨부 정리 실패해도 문서 삭제는 계속 진행 */ }
  await deleteDoc(doc(db, COL, id));
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

// orderBy("createdAt") 를 쓰지 않는다 — Firestore 는 정렬 대상 필드가 없는 문서를 쿼리 결과에서
// 통째로 제외하므로, createdAt 없는 legacy 문서가 있으면 목록에서 조용히 누락된다.
// 대신 전체를 가져온 뒤 클라이언트에서 정렬한다(listChainPermits 의 기존 패턴과 동일).
export async function listMyPermits(uid: string): Promise<PermitRecord[]> {
  const q = query(collection(db, COL), where("createdBy", "==", uid));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as PermitRecord))
    .sort((a, b) => {
      const ta = (a.createdAt as unknown as { seconds?: number })?.seconds ?? 0;
      const tb = (b.createdAt as unknown as { seconds?: number })?.seconds ?? 0;
      return tb - ta;
    });
}

export async function listAllPermits(max = 1000): Promise<{ permits: PermitRecord[]; truncated: boolean }> {
  const q = query(collection(db, COL), orderBy("createdAt", "desc"), limit(max));
  const snap = await getDocs(q);
  const permits = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PermitRecord));
  return { permits, truncated: permits.length >= max };
}

// 관리자(결재라인) 본인 관련 건. requester=본인이 담당자인 건만 / safety·factory=전체(초안 제외).
// requester 는 단일 equality 쿼리(복합 인덱스 불필요) 후 클라이언트 정렬.
export async function listChainPermits(
  managerKind: string, managerName: string, max = 1000,
): Promise<{ permits: PermitRecord[]; truncated: boolean }> {
  let docs;
  let truncated = false;
  if (managerKind === "requester") {
    const statuses: PermitStatus[] = ["submitted", "approved", "rejected", "completed"];
    const snaps = await Promise.all(
      statuses.map((status) =>
        getDocs(query(
          collection(db, COL),
          where("data.manager", "==", managerName),
          where("status", "==", status),
          limit(max),
        )),
      ),
    );
    // 상태별 쿼리 중 하나라도 max 에 도달하면(=그 상태만으로 max 건) 더 있을 수 있다.
    truncated = snaps.some((snap) => snap.docs.length >= max);
    const seen = new Set<string>();
    docs = snaps
      .flatMap((snap) => snap.docs)
      .filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
  } else {
    // 공장장(factory): 자기 차례(stage=factory) + 완료(approved/completed)만 — rules 와 일치
    const [s1, s2] = await Promise.all([
      getDocs(query(collection(db, COL), where("stage", "==", "factory"), where("status", "==", "submitted"), limit(max))),
      getDocs(query(collection(db, COL), where("status", "in", ["approved", "completed"]), limit(max))),
    ]);
    truncated = s1.docs.length >= max || s2.docs.length >= max;
    const seen = new Set<string>();
    docs = [...s1.docs, ...s2.docs].filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
  }
  const permits = docs
    .map((d) => ({ id: d.id, ...d.data() } as PermitRecord))
    .filter((p) => p.status !== "draft")
    .sort((a, b) => {
      const ta = (a.submittedAt as { seconds?: number })?.seconds ?? 0;
      const tb = (b.submittedAt as { seconds?: number })?.seconds ?? 0;
      return tb - ta;
    });
  return { permits, truncated };
}
