export default function SignatureField({
  value,
  readOnly,
  onClick,
}: {
  value: string;
  readOnly?: boolean;
  onClick: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {value
        ? <img src={value} alt="서명" style={{ height: 38, width: 110, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: 4, background: "#fff" }} />
        : <span style={{ fontSize: 12, color: "#94a3b8" }}>미서명</span>}
      {!readOnly && <button className="mini" onClick={onClick}>{value ? "서명 수정" : "서명"}</button>}
    </div>
  );
}
