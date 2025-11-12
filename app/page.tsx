"use client";
import { useState } from "react";

export default function Page() {
const [q, setQ] = useState("");
const [msgs, setMsgs] = useState<{q:string,a:string,c:any[]}[]>([]);

async function ask() {
const r = await fetch("/api/ask", {
method: "POST",
headers: {"Content-Type":"application/json"},
body: JSON.stringify({ query: q, localOnly: false })
});
const data = await r.json();
setMsgs(m => [...m, { q, a: data.answer, c: data.citations }]);
setQ("");
}

return (
<main style={{maxWidth:800, margin:"40px auto", fontFamily:"system-ui"}}>
<h1>Local Docs Chat</h1>
<div style={{display:"flex", gap:8}}>
<input
value={q}
onChange={e=>setQ(e.target.value)}
onKeyDown={e=>e.key==="Enter" && ask()}
placeholder="Ask your docs..."
style={{flex:1, padding:10, border:"1px solid #ccc"}}
/>
<button onClick={ask}>Ask</button>
</div>
<div style={{marginTop:24}}>
{msgs.map((m,i)=>(
<div key={i} style={{border:"1px solid #eee", padding:12, margin:"12px 0"}}>
<div><strong>You:</strong> {m.q}</div>
<div style={{whiteSpace:"pre-wrap", marginTop:8}}><strong>Answer:</strong> {m.a}</div>
{m.c?.length ? (
<div style={{fontSize:14, color:"#555", marginTop:8}}>
Sources: {m.c.map((c:any)=>`[#${c.id} ${c.file}]`).join(" ")}
</div>
) : null}
</div>
))}
</div>
</main>
);
}
