// 사내 담당자(공사 의뢰자) 목록.
// ※ 이메일은 클라이언트 번들 노출을 피하기 위해 서버(api/notify/route.ts)에만 보관한다.
export interface Manager { name: string; dept: string; }

export const MANAGERS: Manager[] = [
  { name: "이도현", dept: "생산설비관리팀" },
  { name: "이재준", dept: "생산설비관리팀" },
  { name: "김승정", dept: "생산설비관리팀" },
  { name: "신동호", dept: "생산설비관리팀" },
  { name: "노대균", dept: "생산설비관리팀" },
  { name: "박경호", dept: "생산설비관리팀" },
  { name: "노영준", dept: "생산설비관리팀" },
  { name: "김지훈", dept: "생산설비관리팀" },
  { name: "배상식", dept: "생산설비관리팀" },
  { name: "박병후", dept: "생산설비관리팀" },
  { name: "박세현", dept: "품질안전part" },
  { name: "이승준", dept: "품질안전part" },
  { name: "이승훈", dept: "품질안전part" },
  { name: "정창재", dept: "품질안전part" },
  { name: "황성재", dept: "품질안전part" },
  { name: "박승준", dept: "개발팀" },
  { name: "조성운", dept: "개발팀" },
  { name: "박대규", dept: "개발팀" },
  { name: "김욱진", dept: "개발팀" },
  { name: "곽복영", dept: "개발팀" },
  { name: "임종문", dept: "생산관리part" },
  { name: "김율구", dept: "생산관리part" },
];

export function managerDept(name: string): string {
  return MANAGERS.find((m) => m.name === name)?.dept ?? "";
}
