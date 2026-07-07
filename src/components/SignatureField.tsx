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
        ? <img src={value} alt="서명" className="sig-thumb" />
        : <span className="sig-empty">미서명</span>}
      {!readOnly && <button className="mini" onClick={onClick}>{value ? "서명 수정" : "서명"}</button>}
    </div>
  );
}
