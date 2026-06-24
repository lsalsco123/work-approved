import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, orderBy, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { PermitData } from "./types";

// 작업형태별 예시 양식 (관리자가 작성/수정, 게스트가 불러와서 채움)
export interface PermitTemplate {
  id: string;
  name: string;       // 표시 이름 (예: "화기작업 - 용접/절단")
  workType: string;   // 대표 작업형태 키 (general/hot/... ) — 분류/표시용, 빈 값 허용
  order: number;      // 정렬 순서
  data: PermitData;   // 폼에 채워질 값
  updatedAt?: Timestamp;
  updatedBy?: string;
}

export interface TemplateInput {
  name: string;
  workType: string;
  order: number;
  data: PermitData;
}

const COL = "permitTemplates";

export async function listTemplates(): Promise<PermitTemplate[]> {
  const q = query(collection(db, COL), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PermitTemplate));
}

export async function getTemplate(id: string): Promise<PermitTemplate | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as PermitTemplate;
}

export async function createTemplate(t: TemplateInput, byEmail: string): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...t, updatedAt: serverTimestamp(), updatedBy: byEmail,
  });
  return ref.id;
}

export async function updateTemplate(id: string, t: TemplateInput, byEmail: string): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    ...t, updatedAt: serverTimestamp(), updatedBy: byEmail,
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
