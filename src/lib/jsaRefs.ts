import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { JsaRow } from "./types";

// 작업형태별 JSA 레퍼런스 — 관리자가 작업종류마다 미리 작성해두면, 업체가 작성 시 불러와 채운다.
// doc id = 작업형태 키(general/hot/confined/...).
export interface JsaReference {
  workType: string;
  rows: JsaRow[];
  updatedAt?: Timestamp;
  updatedBy?: string;
}

const COL = "jsaReferences";

export async function getJsaRef(workType: string): Promise<JsaReference | null> {
  const snap = await getDoc(doc(db, COL, workType));
  return snap.exists() ? (snap.data() as JsaReference) : null;
}

export async function listJsaRefs(): Promise<JsaReference[]> {
  const snap = await getDocs(collection(db, COL));
  return snap.docs.map((d) => d.data() as JsaReference);
}

export async function saveJsaRef(workType: string, rows: JsaRow[], byEmail: string): Promise<void> {
  await setDoc(doc(db, COL, workType), {
    workType, rows, updatedAt: serverTimestamp(), updatedBy: byEmail,
  });
}

export async function deleteJsaRef(workType: string): Promise<void> {
  await deleteDoc(doc(db, COL, workType));
}
