#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = process.env.DOTENV_PATH ?? path.join(ROOT, ".env");
const AUTH = new URL(process.env.AUTH_ORIGIN ?? "https://syrianfatora-auth.kinan-api.workers.dev").origin;
const MCP = new URL(process.env.MCP_ORIGIN ?? "https://syrianfatora-mcp.kinan-api.workers.dev").origin + "/mcp";
const CACHE = path.join(homedir(), ".syrianfatora-live-test", "client.json");
const REDIRECT = "http://127.0.0.1:43127/callback";
const PROTOCOL = "2025-03-26";
const results = [];
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
const marker = `MCP-SKILLS-${stamp}-${randomUUID().slice(0,8)}`;
const code = marker.replace(/[^A-Z0-9-]/g, "").slice(0,48);
const today = new Date().toISOString().slice(0,10);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
console.log("LIVE_TEST_MARKER "+marker);

function parseEnv(s) {
  const m = new Map();
  for (const line of s.split(/\r?\n/)) {
    const x = line.match(/^\s*(KEY_[123])\s*=\s*(.*?)\s*$/);
    if (x) { let v=x[2]; if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); if(v)m.set(x[1],v); }
  }
  return m;
}
const b64 = x => Buffer.from(x).toString("base64url");
async function json(res,label) {
  const raw=await res.text(); let d; try{d=JSON.parse(raw)}catch{throw Error(label+": non-JSON HTTP "+res.status)}
  if(!res.ok) throw Error(label+": HTTP "+res.status); return d;
}
async function clientId() {
  try { const x=JSON.parse(await readFile(CACHE,"utf8")); if(x.redirect_uri===REDIRECT)return x.client_id; } catch {}
  const d=await json(await fetch(AUTH+"/oauth/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({client_name:"SyrianFatora skills lifecycle test",redirect_uris:[REDIRECT],token_endpoint_auth_method:"none"})}),"register");
  await mkdir(path.dirname(CACHE),{recursive:true,mode:0o700});
  await writeFile(CACHE,JSON.stringify({client_id:d.client_id,redirect_uri:REDIRECT})+"\n",{mode:0o600}); await chmod(CACHE,0o600);
  return d.client_id;
}
function cookies(r){const a=typeof r.headers.getSetCookie==="function"?r.headers.getSetCookie():[r.headers.get("set-cookie")].filter(Boolean);return a.map(x=>x.split(";")[0]).join("; ")}
async function authorize(label,key,cid,scopes) {
  const state=b64(randomBytes(32)), verifier=b64(randomBytes(32)), challenge=createHash("sha256").update(verifier).digest("base64url");
  const u=new URL(AUTH+"/authorize"); u.search=new URLSearchParams({response_type:"code",client_id:cid,redirect_uri:REDIRECT,scope:scopes.join(" "),state,code_challenge:challenge,code_challenge_method:"S256",resource:MCP}).toString();
  const page=await fetch(u,{headers:{accept:"text/html"},redirect:"manual"}); if(page.status!==200)throw Error(label+" OAuth consent HTTP "+page.status);
  const html=await page.text(), h=html.match(/<input\s+type="hidden"\s+name="handle"\s+value="([^"]+)"/i); if(!h)throw Error(label+" consent handle missing");
  const ck=cookies(page); if(!ck)throw Error(label+" consent cookie missing");
  const form=new URLSearchParams(); form.set("handle",h[1]); form.set("api_key",key); form.set("decision","approve"); for(const s of scopes)form.append("scope",s);
  const approved=await fetch(AUTH+"/authorize",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded",cookie:ck},body:form,redirect:"manual"});
  if(approved.status!==302)throw Error(label+" consent failed HTTP "+approved.status+" retry-after="+(approved.headers.get("retry-after")||"not-provided"));
  return exchange(approved,label,cid,verifier);
}
async function exchange(approved,label,cid,verifier) {
  const cb=new URL(approved.headers.get("location")||""); if(cb.origin!==new URL(REDIRECT).origin||cb.pathname!=="/callback")throw Error(label+" redirect mismatch");
  const form=new URLSearchParams({grant_type:"authorization_code",code:cb.searchParams.get("code"),redirect_uri:REDIRECT,client_id:cid,code_verifier:verifier,resource:MCP});
  const t=await json(await fetch(AUTH+"/oauth/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:form}),label+" token");
  if(!t.access_token||!t.refresh_token)throw Error(label+" token fields missing"); return t;
}
async function revoke(t,cid,label) {
  if(!t?.refresh_token)return;
  const d=await json(await fetch(AUTH+"/.well-known/oauth-authorization-server"),"discovery");
  const r=await fetch(d.revocation_endpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token:t.refresh_token,token_type_hint:"refresh_token",client_id:cid})});
  if(![200,204].includes(r.status))throw Error(label+" OAuth grant cleanup HTTP "+r.status);
}
async function rpc(method,params,t,id,session) {
  await pause(1150);
  const r=await fetch(MCP,{method:"POST",headers:{authorization:"Bearer "+t.access_token,"content-type":"application/json",accept:"application/json, text/event-stream","MCP-Protocol-Version":PROTOCOL,...(session?{"MCP-Session-Id":session}:{})},body:JSON.stringify({jsonrpc:"2.0",id,method,...(params===undefined?{}:{params})})});
  const raw=await r.text(); if(r.status!==200)throw Error("MCP "+method+" HTTP "+r.status+" retry-after="+(r.headers.get("retry-after")||"not-provided"));
  const m=JSON.parse(raw); if(m.error)throw Error("MCP "+method+" RPC "+m.error.code);
  return {message:m,session:r.headers.get("MCP-Session-Id")||session};
}
async function notify(method,t,s) {
  await pause(1150);
  const r=await fetch(MCP,{method:"POST",headers:{authorization:"Bearer "+t.access_token,"content-type":"application/json",accept:"application/json, text/event-stream","MCP-Protocol-Version":PROTOCOL,...(s?{"MCP-Session-Id":s}:{})},body:JSON.stringify({jsonrpc:"2.0",method})});
  if(![200,202,204].includes(r.status))throw Error("notify HTTP "+r.status);
}
async function session(t) {
  let x=await rpc("initialize",{protocolVersion:PROTOCOL,capabilities:{},clientInfo:{name:"syrianfatora-skills-test",version:"1.0"}},t,1);
  assert.equal(x.message.result?.serverInfo?.name,"syrianfatora-mcp"); await notify("notifications/initialized",t,x.session);
  x=await rpc("tools/list",{},t,2,x.session); const tools=x.message.result?.tools||[];
  assert.equal(tools.length,51); return {s:x.session,names:new Set(tools.map(z=>z.name))};
}
let nextId=10;
async function rawCall(name,args,t,s) {
  const x=await rpc("tools/call",{name,arguments:args},t,nextId++,s);
  const result=x.message.result, txt=(result?.content||[]).find(z=>z.type==="text")?.text;
  if(typeof txt!=="string")throw Error(name+" missing text response");
  let payload; try{payload=JSON.parse(txt)}catch{throw Error(name+" returned non-JSON tool response: "+txt.slice(0,180))};
  return {payload,isError:result.isError===true};
}
async function call(name,args,t,s) {
  const x=await rawCall(name,args,t,s), status=Number(x.payload.status);
  if(status<200||status>=300||x.isError){ const detail=x.payload?.data?.errors??x.payload?.data?.message??x.payload?.message??null; throw Error(name+" upstream HTTP "+status+(detail?" validation="+JSON.stringify(detail).slice(0,240):"")); }
  return x.payload;
}
async function expectHttp(name,args,t,s,expectedStatus,label) {
  const x=await rawCall(name,args,t,s), status=Number(x.payload.status);
  assert.equal(status,expectedStatus,label+" expected HTTP "+expectedStatus+" but received "+status);
  results.push({resource:label,phase:"safe-negative-probe",tool:name,status,ok:true});
  console.log("NEGATIVE_PROBE_PASS "+label+" HTTP "+status);
  return x;
}
const unwrap = x => x?.data?.data ?? x?.data;
function getId(x) { const d=unwrap(x); return d?.id ?? d?.data?.id ?? null; }
async function get(t,s,res,id) { return rawCall(res+"_get",{id:String(id)},t,s); }
async function assertDeleted(t,s,res,id,label) {
  const x=await get(t,s,res,id), status=Number(x.payload.status);
  assert.equal(status,404,label+" deletion not confirmed (HTTP "+status+")");
}
async function listAll(t,s,names,label) {
  for(const resource of names) {
    const x=await call(resource+"_list",{query:{per_page:1}},t,s);
    results.push({resource,phase:"list",key:label,status:Number(x.status),ok:true});
  }
}
async function lifecycle(resource,body,updateBody,key3,s3,key1,s1,key2,s2) {
  const create=await call(resource+"_create",{body},key3,s3); const id=getId(create);
  if(id===null||id===undefined)throw Error(resource+" create returned no ID; safe cleanup impossible");
  results.push({resource,phase:"create",key:"KEY_3",status:Number(create.status),id:String(id),ok:true});
  try {
    const a=await get(key1,s1,resource,id); if(Number(a.payload.status)<200||Number(a.payload.status)>=300||a.isError)throw Error(resource+" KEY_1 cannot read created record");
    results.push({resource,phase:"read-created",key:"KEY_1",status:Number(a.payload.status),ok:true});
    const upd=await call(resource+"_update",{id:String(id),body:updateBody},key3,s3);
    results.push({resource,phase:"update",key:"KEY_3",status:Number(upd.status),ok:true});
    const b=await get(key2,s2,resource,id); if(Number(b.payload.status)<200||Number(b.payload.status)>=300||b.isError)throw Error(resource+" KEY_2 cannot read updated record");
    const updatedRecord=unwrap(b.payload); const changed=Object.keys(updateBody).find(k=>JSON.stringify(updateBody[k])!==JSON.stringify(body[k]) && (updateBody[k]===null || typeof updateBody[k]!=="object"));
    const expected=changed?updateBody[changed]:undefined, actual=changed?updatedRecord?.[changed]:undefined;
    const same=changed?(typeof expected==="number"?Number(actual)===expected:JSON.stringify(actual)===JSON.stringify(expected)):true;
    if(changed && !same) throw Error(resource+" update did not persist field "+changed);
    results.push({resource,phase:"read-updated",key:"KEY_2",status:Number(b.payload.status),verifiedField:changed||null,ok:true});
    const del=await call(resource+"_delete",{id:String(id)},key3,s3);
    results.push({resource,phase:"delete",key:"KEY_3",status:Number(del.status),ok:true});
    await assertDeleted(key1,s1,resource,id,"KEY_1");
    await assertDeleted(key2,s2,resource,id,"KEY_2");
    results.push({resource,phase:"verify-deleted",key:"KEY_1+KEY_2",status:404,ok:true});
  } catch(e) {
    try {
      const chk=await get(key3,s3,resource,id);
      if(Number(chk.payload.status)>=200&&Number(chk.payload.status)<300&&!chk.isError) {
        await call(resource+"_delete",{id:String(id)},key3,s3);
        await assertDeleted(key1,s1,resource,id,"KEY_1");
        await assertDeleted(key2,s2,resource,id,"KEY_2");
        results.push({resource,phase:"cleanup-after-failure",ok:true});
        console.log("CLEANUP "+resource+" verified");
      }
    } catch(cleanError) {
      results.push({resource,phase:"cleanup-warning",reason:String(cleanError?.message||"unknown").slice(0,160),ok:false});
      console.error("CLEANUP_WARNING "+resource);
    }
    throw e;
  }
}
async function safeLifecycle(resource,body,updateBody,t3,s3,t1,s1,t2,s2) {
  try { await lifecycle(resource,body,updateBody,t3,s3,t1,s1,t2,s2); }
  catch(e) {
    results.push({resource,phase:"lifecycle-failed",reason:String(e?.message||"unknown").slice(0,220),ok:false});
    console.error("RESOURCE_ERROR "+resource+" "+String(e?.message||"unknown").slice(0,180));
  }
}

async function main() {
  const keys=parseEnv(await readFile(ENV_PATH,"utf8"));
  for(const k of ["KEY_1","KEY_2","KEY_3"])if(!keys.has(k))throw Error(k+" missing from local env");
  const cid=await clientId();
  let t1,t2,t3,s1,s2,s3,customerId,categoryId,supplierId,catGone=false;
  try {
    t1=await authorize("KEY_1",keys.get("KEY_1"),cid,["mcp:read","offline_access"]); s1=await session(t1);
    t2=await authorize("KEY_2",keys.get("KEY_2"),cid,["mcp:read","offline_access"]); s2=await session(t2);
    t3=await authorize("KEY_3",keys.get("KEY_3"),cid,["mcp:read","mcp:write","offline_access"]); s3=await session(t3);
    const expected=["customers_list","customers_get","customers_create","invoices_list","invoices_get","invoices_create","items_list","items_get","items_create","items_update","items_delete","quotes_list","quotes_get","quotes_create","quotes_update","quotes_delete","credit_notes_list","credit_notes_get","credit_notes_create","credit_notes_update","credit_notes_delete","payments_list","payments_get","payments_create","payments_delete","payment_methods_list","recurring_invoices_list","recurring_invoices_get","recurring_invoices_create","recurring_invoices_update","recurring_invoices_delete","expenses_list","expenses_get","expenses_create","expenses_update","expenses_delete","suppliers_list","suppliers_get","suppliers_create","suppliers_update","suppliers_delete","expense_categories_list","expense_categories_get","expense_categories_create","expense_categories_update","expense_categories_delete","exchange_rates_list","exchange_rates_get","exchange_rates_create","exchange_rates_update","exchange_rates_delete"];
    for(const [label,ss] of [["KEY_1",s1],["KEY_2",s2],["KEY_3",s3]]) {
      assert.equal(ss.names.size,51);
      for(const n of expected)assert.ok(ss.names.has(n),label+" missing "+n);
      results.push({phase:"tools-list",key:label,count:ss.names.size,ok:true});
    }

    if(process.argv.includes("--payment-methods-only")) {
      const response=await call("payment_methods_list",{},t1,s1.s);
      const rows=unwrap(response);
      console.log("PAYMENT_METHODS_READ_ONLY "+JSON.stringify({
        status:Number(response.status),
        methods:Array.isArray(rows)?rows.map(row=>({code:row.code,label:row.label})):[],
      }));
      return;
    }

    if(process.argv.includes("--cleanup-only")) {
      const orphanCats=unwrap(await call("expense_categories_list",{query:{search:"MCP-SKILLS-",per_page:100}},t1,s1.s));
      for(const row of (Array.isArray(orphanCats)?orphanCats:[])) {
        if(typeof row.name==="string" && row.name.startsWith("MCP-SKILLS-") && row.description==="Temporary isolated MCP skills test record." && row.id!==undefined) {
          await call("expense_categories_delete",{id:String(row.id)},t3,s3.s);
          await assertDeleted(t1,s1.s,"expense_categories",row.id,"KEY_1");
          await assertDeleted(t2,s2.s,"expense_categories",row.id,"KEY_2");
          console.log("CLEANUP prior test category verified");
        }
      }
      const orphanQuotes=unwrap(await call("quotes_list",{query:{per_page:100}},t1,s1.s));
      for(const row of (Array.isArray(orphanQuotes)?orphanQuotes:[])) {
        if(row.id!==undefined && row.notes==="Temporary isolated MCP skills test record." && Array.isArray(row.items) && String(row.items[0]?.title||"").startsWith("MCP-SKILLS-")) {
          await call("quotes_delete",{id:String(row.id)},t3,s3.s);
          await assertDeleted(t1,s1.s,"quotes",row.id,"KEY_1");
          await assertDeleted(t2,s2.s,"quotes",row.id,"KEY_2");
          console.log("CLEANUP prior test quote verified");
        }
      }
      const orphanRates=unwrap(await call("exchange_rates_list",{query:{currency:"USD",per_page:100}},t1,s1.s));
      for(const row of (Array.isArray(orphanRates)?orphanRates:[])) {
        if(row.id!==undefined && [1.234567,1.234568].includes(Number(row.rate)) && String(row.effective_date).slice(0,10)==="2099-01-01") {
          await call("exchange_rates_delete",{id:String(row.id)},t3,s3.s);
          await assertDeleted(t1,s1.s,"exchange_rates",row.id,"KEY_1");
          await assertDeleted(t2,s2.s,"exchange_rates",row.id,"KEY_2");
          console.log("CLEANUP prior test exchange rate verified");
        }
      }
      console.log("CLEANUP_ONLY_COMPLETE");
      return;
    }
    const resources=["customers","invoices","items","quotes","credit_notes","payments","payment_methods","recurring_invoices","expenses","suppliers","expense_categories","exchange_rates"];
    const firstRows={};
    for(const [label,t,ss] of [["KEY_1",t1,s1],["KEY_2",t2,s2]]) {
      for(const res of resources) {
        const x=await call(res+"_list",res==="payment_methods"?{}:{query:{per_page:2}},t,ss.s);
        const rows=Array.isArray(unwrap(x))?unwrap(x):[];
        if(label==="KEY_1")firstRows[res]=rows;
        results.push({resource:res,phase:"list",key:label,status:Number(x.status),count:rows.length,ok:true});
        if(res!=="payment_methods"&&rows[0]?.id!==undefined) {
          const g=await get(t,ss.s,res,rows[0].id);
          if(Number(g.payload.status)<200||Number(g.payload.status)>=300||g.isError)throw Error(label+" "+res+"_get failed for an existing record");
          results.push({resource:res,phase:"get-existing",key:label,status:Number(g.payload.status),ok:true});
        }
      }
    }
    // Clean only uniquely marked leftovers from a prior interrupted run; never touch unrelated records.
    const orphanCats=unwrap(await call("expense_categories_list",{query:{search:"MCP-SKILLS-",per_page:100}},t1,s1.s));
    for(const row of (Array.isArray(orphanCats)?orphanCats:[])) {
      if(typeof row.name==="string" && row.name.startsWith("MCP-SKILLS-") && row.description==="Temporary isolated MCP skills test record." && row.id!==undefined) {
        await call("expense_categories_delete",{id:String(row.id)},t3,s3.s);
        await assertDeleted(t1,s1.s,"expense_categories",row.id,"KEY_1");
        await assertDeleted(t2,s2.s,"expense_categories",row.id,"KEY_2");
        results.push({resource:"expense_categories",phase:"cleanup-prior-test-record",ok:true});
        console.log("CLEANUP prior test category verified");
      }
    }
    const orphanRates=unwrap(await call("exchange_rates_list",{query:{currency:"USD",per_page:100}},t1,s1.s));
    for(const row of (Array.isArray(orphanRates)?orphanRates:[])) {
      if(row.id!==undefined && [1.234567,1.234568].includes(Number(row.rate)) && String(row.effective_date).slice(0,10)==="2099-01-01") {
        await call("exchange_rates_delete",{id:String(row.id)},t3,s3.s);
        await assertDeleted(t1,s1.s,"exchange_rates",row.id,"KEY_1");
        await assertDeleted(t2,s2.s,"exchange_rates",row.id,"KEY_2");
        results.push({resource:"exchange_rates",phase:"cleanup-prior-test-record",ok:true});
        console.log("CLEANUP prior test exchange rate verified");
      }
    }
    customerId=firstRows.customers?.[0]?.id;
    if(customerId===undefined||customerId===null)throw Error("No existing customer ID available; dependent quote/credit-note/recurring tests cannot safely run.");

    // Independently reversible resources first; every record is created by KEY_3 and removed by exact ID.
    const itemBody={name:marker+" item",type:"service",code,description:"Temporary isolated MCP skills test record.",default_unit_price:1,tax_rate:0,unit:"test",is_active:true};
    console.log("STAGE items");
    await safeLifecycle("items",itemBody,{...itemBody,description:"Updated temporary MCP skills test record.",default_unit_price:2},t3,s3.s,t1,s1.s,t2,s2.s);

    const supplierBody={name:marker+" supplier",contact_name:"MCP test",notes:"Temporary isolated MCP skills test record.",is_active:true};
    console.log("STAGE suppliers");
    await safeLifecycle("suppliers",supplierBody,{...supplierBody,name:marker+" supplier updated"},t3,s3.s,t1,s1.s,t2,s2.s);

    console.log("STAGE expense_categories");
    const categoryBody={name:marker+" category",description:"Temporary isolated MCP skills test record.",color:"info",icon:"other",sort_order:9999,is_active:true};
    const catCreate=await call("expense_categories_create",{body:categoryBody},t3,s3.s); categoryId=getId(catCreate);
    if(categoryId===null)throw Error("expense category create returned no ID");
    results.push({resource:"expense_categories",phase:"create",key:"KEY_3",status:Number(catCreate.status),ok:true});
    try {
      const r1=await get(t1,s1.s,"expense_categories",categoryId); if(Number(r1.payload.status)<200||Number(r1.payload.status)>=300||r1.isError)throw Error("KEY_1 cannot read created expense category");
      results.push({resource:"expense_categories",phase:"read-created",key:"KEY_1",status:Number(r1.payload.status),ok:true});
      const catUpdate={...categoryBody,name:marker+" category updated",color:"warning"};
      const cu=await call("expense_categories_update",{id:String(categoryId),body:catUpdate},t3,s3.s);
      results.push({resource:"expense_categories",phase:"update",key:"KEY_3",status:Number(cu.status),ok:true});
      const r2=await get(t2,s2.s,"expense_categories",categoryId); if(Number(r2.payload.status)<200||Number(r2.payload.status)>=300||r2.isError)throw Error("KEY_2 cannot read updated expense category");
      const catRecord=unwrap(r2.payload); if(catRecord?.name!==catUpdate.name || catRecord?.color!==catUpdate.color)throw Error("expense category update did not persist");
      results.push({resource:"expense_categories",phase:"read-updated",key:"KEY_2",status:Number(r2.payload.status),ok:true});
    } catch(e) { throw e; }

    console.log("STAGE exchange_rates");
    const existingRate=firstRows.exchange_rates?.[0];
    const rateCurrency=existingRate?.currency || "USD";
    console.log("EXCHANGE_TEST_CURRENCY "+rateCurrency);
    const exchangeBody={currency:rateCurrency,rate:1.234567,effective_date:"2099-01-01"};
    await safeLifecycle("exchange_rates",exchangeBody,{...exchangeBody,rate:1.234568},t3,s3.s,t1,s1.s,t2,s2.s);

    console.log("STAGE expenses");
    const expenseBody={title:marker+" expense",category_id:Number(categoryId),status:"unpaid",bill_date:today,currency:"SYP",amount:0.01,notes:"Temporary isolated MCP skills test record."};
    await safeLifecycle("expenses",expenseBody,{...expenseBody,title:marker+" expense updated",amount:0.02},t3,s3.s,t1,s1.s,t2,s2.s);

    console.log("STAGE quotes");
    const quoteBody={customer_id:Number(customerId),status:"draft",quote_date:today,valid_until:"2099-12-31",language:"ar",currency:"SYP",discount_type:"fixed",tax_mode:"invoice",items:[{title:marker+" quote line",qty:1,unit_price:0.01,discount_type:"fixed"}],notes:"Temporary isolated MCP skills test record."};
    await safeLifecycle("quotes",quoteBody,{...quoteBody,notes:"Updated temporary MCP skills test record.",items:[{title:marker+" quote line updated",qty:1,unit_price:0.02,discount_type:"fixed"}]},t3,s3.s,t1,s1.s,t2,s2.s);

    console.log("STAGE credit_notes");
    const creditBody={customer_id:Number(customerId),currency:"SYP",amount:0.01,reason:marker+" temporary test credit note",issued_at:today,notes:"Temporary isolated MCP skills test record."};
    await safeLifecycle("credit_notes",creditBody,{...creditBody,amount:0.02,reason:marker+" updated temporary test credit note"},t3,s3.s,t1,s1.s,t2,s2.s);

    console.log("STAGE recurring_invoices");
    const recurringBody={customer_id:Number(customerId),currency:"SYP",language:"ar",frequency:"monthly",interval_count:1,start_date:"2099-01-01",next_run_date:"2099-01-01",is_active:false,discount_type:"fixed",tax_mode:"invoice",items:[{title:marker+" recurring line",qty:1,unit_price:0.01,discount_type:"fixed"}],notes:"Temporary inactive MCP skills test schedule."};
    await safeLifecycle("recurring_invoices",recurringBody,{...recurringBody,notes:"Updated temporary inactive MCP skills test schedule."},t3,s3.s,t1,s1.s,t2,s2.s);

    // Category is independent after the expense has been removed.
    await call("expense_categories_delete",{id:String(categoryId)},t3,s3.s); catGone=true;
    await assertDeleted(t1,s1.s,"expense_categories",categoryId,"KEY_1");
    await assertDeleted(t2,s2.s,"expense_categories",categoryId,"KEY_2");
    results.push({resource:"expense_categories",phase:"verify-deleted",key:"KEY_1+KEY_2",status:404,ok:true});
    console.log("CLEANUP expense_categories verified");

    // Read-only/irreversible-only resources: verify access, but do not create permanent customer/invoice/payment records.
    for(const res of ["customers","invoices","payments","payment_methods"]) {
      results.push({resource:res,phase:"write-lifecycle",status:"SKIPPED_BY_DESIGN",reason:res==="payment_methods"?"read-only resource":res==="payments"?"delete is a soft-void, leaving an accounting history entry":res==="customers"?"no delete tool; test creation would leave a permanent customer":"no delete tool; test creation would leave a permanent invoice",ok:null});
    }
    // Exercise the previously untested write-only surfaces with deliberately invalid
    // references/required values. The provider must reject these without creating records.
    console.log("STAGE safe-negative-write-probes");
    await expectHttp("customers_create",{body:{name:""}},t3,s3.s,422,"customers-create-validation");
    await expectHttp("invoices_create",{body:{
      customer_id:2147483647,status:"draft",invoice_date:today,currency:"SYP",
      language:"ar",discount_type:"fixed",tax_mode:"invoice",
      items:[{title:marker+" invalid invoice",qty:1,unit_price:0.01,discount_type:"fixed"}],
    }},t3,s3.s,422,"invoices-create-invalid-customer");
    await expectHttp("payments_create",{body:{
      invoice_id:2147483647,amount:0.01,currency:"SYP",paid_at:today,method:"cash",
    }},t3,s3.s,422,"payments-create-invalid-invoice");
    try {
      await expectHttp("payments_delete",{
        id:"2147483647",void_reason:"Nonexistent test payment; no real record is targeted.",
      },t3,s3.s,404,"payments-void-requires-void_reason-and-returns-not-found");
    } catch(e) {
      if(/arguments\.reason is required/.test(String(e?.message||""))) {
        results.push({resource:"payments",phase:"deployment-gate",status:"BLOCKED_OLD_DEPLOYMENT_SCHEMA",
          reason:"The deployed MCP tool still requires legacy argument reason; the void_reason probe was rejected before reaching REST.",ok:null});
        console.log("DEPLOYMENT_GATE_BLOCKED production MCP still requires legacy reason");
      } else throw e;
    }

    const failed=results.filter(r=>r.ok===false);
    const blocked=results.some(r=>r.status==="BLOCKED_OLD_DEPLOYMENT_SCHEMA");
    const status=failed.length?"FAIL":blocked?"BLOCKED_STALE_PRODUCTION":"PASS";
    console.log("LIVE_SKILLS_TEST_RESULT "+JSON.stringify({status,toolCount:51,failedCount:failed.length,results}));
    if(failed.length)throw Error("One or more live MCP lifecycle checks failed; inspect result records.");
  } catch(e) {
    console.error("STAGE_ERROR "+String(e?.message||"unknown").slice(0,240));
    throw e;
  } finally {
    if(categoryId!==undefined&&!catGone) {
      try { await call("expense_categories_delete",{id:String(categoryId)},t3,s3.s); await assertDeleted(t1,s1.s,"expense_categories",categoryId,"KEY_1"); await assertDeleted(t2,s2.s,"expense_categories",categoryId,"KEY_2"); results.push({resource:"expense_categories",phase:"cleanup-after-failure",ok:true}); console.log("CLEANUP expense_categories verified"); }
      catch(e) { results.push({resource:"expense_categories",phase:"cleanup-warning",reason:String(e?.message||"unknown").slice(0,180),ok:false}); console.error("CLEANUP_WARNING expense_categories"); }
    }
    for(const [t,label] of [[t1,"KEY_1"],[t2,"KEY_2"],[t3,"KEY_3"]]) if(t) await revoke(t,cid,label);
  }
}
main().catch(e=>{console.error("LIVE_SKILLS_TEST_FAILED "+String(e?.message||"unknown").slice(0,240));process.exitCode=1;});
