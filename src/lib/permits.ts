import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { PermitData } from "./types";

export type PermitStatus = "draft" | "submitted" | "approved" | "rejected" | "completed";

export interface PermitRecord {
  id: string;
  status: PermitStatus;
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
  await updateDoc(doc(db, COL, id), {
    status: "submitted", submittedAt: serverTimestamp(), updatedAt: serverTimestamp(),
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
