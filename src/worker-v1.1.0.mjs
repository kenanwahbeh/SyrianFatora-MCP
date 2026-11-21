/*
 * LEGACY ARCHIVE — DO NOT DEPLOY.
 *
 * Historical v1.1.0 worker retained for reference only. It is not the
 * supported production entrypoint and must not be used in Wrangler,
 * CI/CD, or any new deployment configuration.
 *
 * SECURITY LIMITATIONS (intentionally preserved for historical reference):
 * - Accepts a workspace API key directly as a Bearer token.
 * - Returns upstream response details and raw error messages.
 * - Does not implement the current OAuth, scope enforcement, and
 *   hardened error-handling architecture.
 *
 * Use the maintained Workers under apps/ for all development and
 * deployments. Any reuse of this file requires a security review and
 * explicit migration; do not copy it into a production Worker.
 */
const BASE = "https://syrianfatora.com/api/public/v1";
const RESOURCES = {
  customers:["list","get","create"], invoices:["list","get","create"],
  items:["list","get","create","update","delete"], quotes:["list","get","create","update","delete"],
  "credit-notes":["list","get","create","update","delete"], payments:["list","get","create","delete"],
  "payment-methods":["list"], "recurring-invoices":["list","get","create","update","delete"],
  expenses:["list","get","create","update","delete"], suppliers:["list","get","create","update","delete"],
  "expense-categories":["list","get","create","update","delete"], "exchange-rates":["list","get","create","update","delete"]
};
const GUIDANCE = {
  customers:"Customer records. Use only documented SyrianFatora customer fields.",
  invoices:"Sales invoices. Supply customer and line-item details (quantities, unit prices and applicable tax data). Never send calculated totals; SyrianFatora calculates invoice totals.",
  items:"Products or services. Use exact documented item fields and decimal strings for monetary values.",
  quotes:"Sales quotations. Supply line-item details; do not send calculated totals.",
  "credit-notes":"Credit notes. Use documented invoice/customer references and line-item details.",
  payments:"Payment records. Use documented invoice/customer reference, amount, currency and payment-method fields.",
  "payment-methods":"Available payment methods. Read-only lookup.",
  "recurring-invoices":"Recurring invoice schedules. Use documented schedule and line-item fields; do not send calculated totals.",
  expenses:"Business expenses. Use documented supplier/category references, date, description and amount fields.",
  suppliers:"Supplier records. Use only documented SyrianFatora supplier fields.",
  "expense-categories":"Expense category records. Use only documented category fields.",
  "exchange-rates":"Exchange-rate records. Preserve currency codes and decimal precision exactly as documented."
};
function describe(resource, action) {
  const base=GUIDANCE[resource]||resource;
  if(action==="list") return "List "+resource+" records. Supports documented filters and pagination (page, per_page; per_page 1–100). "+base;
  if(action==="get") return "Retrieve one "+resource+" record by its ID. "+base;
  if(action==="create") return (resource==="payments"?"Record a payment. ":"Create a "+resource+" record. ")+base;
  if(action==="update") return "Update a "+resource+" record by ID. "+base;
  if(resource==="payments") return "Void a payment by ID. This is a soft delete and requires a reason; it does not erase payment history.";
  return "Delete a "+resource+" record by ID. This operation changes live workspace data.";
}
const tools=[];
for(const [resource,actions] of Object.entries(RESOURCES)) for(const action of actions) {
  const props={},required=[];
  if(["get","update","delete"].includes(action)){props.id={type:"string",minLength:1,description:"Record ID returned by SyrianFatora."};required.push("id");}
  if(action==="list") props.query={type:"object",description:"Optional documented filters. Pagination: page >= 1; per_page is 1–100 (default 25).",properties:{page:{type:"integer",minimum:1},per_page:{type:"integer",minimum:1,maximum:100}},additionalProperties:true};
  if(["create","update"].includes(action)){props.body={type:"object",description:"JSON request body using exact SyrianFatora API field names. Do not include server-calculated invoice, quote or recurring-invoice totals.",additionalProperties:true};required.push("body");}
  if(resource==="payments"&&action==="delete"){props.reason={type:"string",minLength:3,maxLength:500,description:"Required reason for voiding this payment."};required.push("reason");}
  tools.push({name:resource.replace(/-/g,"_")+"_"+action,description:describe(resource,action),inputSchema:{type:"object",properties:props,required,additionalProperties:false}});
}
function reply(id,result){return Response.json({jsonrpc:"2.0",id,result},{headers:{"Cache-Control":"no-store"}});}
function rpcError(id,code,message,status){return Response.json({jsonrpc:"2.0",id,error:{code,message}},{status:status||400,headers:{"Cache-Control":"no-store"}});}
function toolError(id,message,details){return reply(id,{content:[{type:"text",text:message+(details?"\n"+details:"")}],isError:true});}
export default {async fetch(request){
  const url=new URL(request.url);
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, GET, OPTIONS","Access-Control-Allow-Headers":"content-type, authorization, mcp-protocol-version, accept"}});
  if(url.pathname==="/health") return Response.json({ok:true,service:"SyrianFatora MCP",version:"1.1.0",toolCount:tools.length,resources:Object.keys(RESOURCES)},{headers:{"Cache-Control":"no-store"}});
  if(url.pathname!=="/mcp") return new Response("Not found",{status:404});
  if(request.method==="GET") return new Response("Method Not Allowed",{status:405,headers:{Allow:"POST, OPTIONS"}});
  if(request.method!=="POST") return new Response("Method Not Allowed",{status:405,headers:{Allow:"POST, OPTIONS"}});
  const length=Number(request.headers.get("content-length")||0);
  if(length>1048576) return new Response("Request too large",{status:413});
  const auth=request.headers.get("Authorization")||"";
  const apiKey=auth.startsWith("Bearer ")?auth.slice(7).trim():"";
  if(!apiKey) return Response.json({error:"Missing Bearer token. Supply the SyrianFatora workspace API key through the authorized MCP connection."},{status:401,headers:{"WWW-Authenticate":'Bearer realm="SyrianFatora MCP"',"Cache-Control":"no-store"}});
  let message;
  try{message=await request.json();}catch{return rpcError(null,-32700,"Parse error: request body must be valid JSON.",400);}
  if(!message||Array.isArray(message)||message.jsonrpc!=="2.0"||typeof message.method!=="string") return rpcError(message&&message.id!==undefined?message.id:null,-32600,"Invalid JSON-RPC request.");
  const id=message.id===undefined?null:message.id;
  if(message.method==="notifications/initialized"||message.method==="notifications/cancelled") return new Response(null,{status:202,headers:{"Cache-Control":"no-store"}});
  if(message.method==="initialize"){
    const requested=message.params&&message.params.protocolVersion;
    const supported=["2025-03-26","2024-11-05"];
    return reply(id,{protocolVersion:supported.includes(requested)?requested:"2025-03-26",capabilities:{tools:{listChanged:false}},serverInfo:{name:"syrianfatora-mcp",version:"1.1.0"}});
  }
  if(message.method==="ping") return reply(id,{});
  if(message.method==="tools/list") return reply(id,{tools});
  if(message.method!=="tools/call") return rpcError(id,-32601,"Method not found: "+message.method,404);
  const name=message.params&&message.params.name;
  const tool=tools.find(x=>x.name===name);
  if(!tool) return rpcError(id,-32602,"Unknown tool: "+String(name));
  const args=message.params&&message.params.arguments?message.params.arguments:{};
  if(!args||typeof args!=="object"||Array.isArray(args)) return toolError(id,"Tool arguments must be a JSON object.");
  const split=tool.name.lastIndexOf("_"),action=tool.name.slice(split+1),resource=tool.name.slice(0,split).replace(/_/g,"-");
  const method=action==="list"||action==="get"?"GET":action==="create"?"POST":action==="update"?"PUT":"DELETE";
  let path="/"+resource;
  if(["get","update","delete"].includes(action)){
    if(typeof args.id!=="string"||!args.id.trim()||args.id.length>200) return toolError(id,"A valid record ID is required.");
    path+="/"+encodeURIComponent(args.id.trim());
  }
  const target=new URL(BASE+path);
  if(action==="list"&&args.query!==undefined){
    if(!args.query||typeof args.query!=="object"||Array.isArray(args.query)) return toolError(id,"The query argument must be a JSON object.");
    if(args.query.per_page!==undefined&&(!Number.isInteger(args.query.per_page)||args.query.per_page<1||args.query.per_page>100)) return toolError(id,"per_page must be an integer from 1 to 100.");
    if(args.query.page!==undefined&&(!Number.isInteger(args.query.page)||args.query.page<1)) return toolError(id,"page must be a positive integer.");
    for(const [key,value] of Object.entries(args.query)){
      if(!/^[a-zA-Z0-9_]+$/.test(key)) return toolError(id,"Invalid query parameter name: "+key);
      if(value===null||value===undefined) continue;
      if(!["string","number","boolean"].includes(typeof value)) return toolError(id,"Query parameter values must be strings, numbers or booleans: "+key);
      target.searchParams.set(key,String(value));
    }
  }
  const headers={Authorization:"Bearer "+apiKey,Accept:"application/json"};
  let body;
  if(action==="create"||action==="update"){
    if(!args.body||typeof args.body!=="object"||Array.isArray(args.body)) return toolError(id,"A JSON object body is required.");
    body=JSON.stringify(args.body);headers["Content-Type"]="application/json";
  }else if(resource==="payments"&&action==="delete"){
    if(typeof args.reason!=="string"||args.reason.trim().length<3||args.reason.length>500) return toolError(id,"A void reason of 3–500 characters is required.");
    body=JSON.stringify({reason:args.reason.trim()});headers["Content-Type"]="application/json";
  }
  try{
    const upstream=await fetch(target.toString(),{method,headers,...(body!==undefined?{body}:{})});
    const raw=await upstream.text();let data;
    try{data=raw?JSON.parse(raw):null;}catch{data={raw:raw.slice(0,3000)};}
    return reply(id,{content:[{type:"text",text:JSON.stringify({status:upstream.status,data,rateLimit:{limit:upstream.headers.get("X-RateLimit-Limit"),remaining:upstream.headers.get("X-RateLimit-Remaining"),retryAfter:upstream.headers.get("Retry-After")}})}],isError:!upstream.ok});
  }catch(error){return toolError(id,"SyrianFatora API request failed.",String(error&&error.message?error.message:error));}
}};
