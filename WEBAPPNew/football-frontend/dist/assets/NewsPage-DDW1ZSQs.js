import{r as d,d as C,j as e}from"./index-DZxWq4wc.js";const F={beige:"#1e293b"},M=c=>{if(!c)return"";const o=Date.now(),h=new Date(c).getTime(),a=Math.max(0,Math.floor((o-h)/1e3));return a<60?`${a}s ago`:a<3600?`${Math.floor(a/60)}m ago`:a<86400?`${Math.floor(a/3600)}h ago`:new Date(c).toLocaleString()},$=c=>{try{const{origin:o}=new URL(c);return`${o}/favicon.ico`}catch{return null}};function T(){const[,c]=d.useState([]),[o,h]=d.useState({}),[a,v]=d.useState(""),[x,f]=d.useState({}),{fetchIfNeeded:b,NewsData:g,loading:k}=C();d.useEffect(()=>{(async()=>{if(await b(),!g.current)return;const t=g.current.map(r=>{let n={};try{n=JSON.parse(String(r.source||"{}").replace(/'\s*:\s*'/g,'"$1"').replace(/'/g,'"'))}catch{}return{...r,parsedSource:n}});c(t);const l=t.reduce((r,n)=>{const i=n.topic||"Other";return(r[i]||(r[i]=[])).push(n),r},{}),m=Object.keys(l).reduce((r,n)=>(r[n]=!0,r),{});f(m),h(l)})()},[b,g]);const S=d.useMemo(()=>Object.entries(o).map(([s,t])=>({key:s,count:t.length})).sort((s,t)=>s.key.localeCompare(t.key)),[o]),j=d.useMemo(()=>{if(!a.trim())return o;const s=a.toLowerCase(),t={};for(const[l,m]of Object.entries(o)){const r=m.filter(n=>{var u;const i=String(n.content||"").toLowerCase(),p=String(((u=n.parsedSource)==null?void 0:u.name)||"").toLowerCase();return i.includes(s)||p.includes(s)});r.length&&(t[l]=r)}return t},[o,a]),w=s=>f(t=>({...t,[s]:!t[s]})),L=()=>e.jsxs("div",{className:"rounded-xl border border-slate-200 bg-white p-4",children:[e.jsx("div",{className:"h-3 w-24 bg-slate-200 rounded mb-3 animate-pulse"}),e.jsx("div",{className:"h-4 w-40 bg-slate-200 rounded mb-2 animate-pulse"}),e.jsx("div",{className:"h-4 w-3/4 bg-slate-200 rounded mb-1 animate-pulse"}),e.jsx("div",{className:"h-4 w-2/3 bg-slate-200 rounded animate-pulse"})]});return e.jsx("div",{style:{minHeight:"100%",padding:"1.5rem 1rem 2.5rem",background:"transparent",color:F.beige,fontFamily:"system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"},children:e.jsxs("div",{className:"mx-auto max-w-7xl",children:[e.jsxs("header",{className:"mb-6 sm:mb-8 text-center",children:[e.jsx("h1",{className:"text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight",children:"Premier League News"}),e.jsx("p",{className:"text-xs sm:text-sm text-slate-600 mt-2 max-w-2xl mx-auto",children:"Latest headlines, grouped by topic. Click a topic to collapse or expand, or search across all articles."})]}),e.jsxs("section",{className:"mb-6 space-y-3",children:[e.jsx("div",{className:"max-w-xl mx-auto w-full rounded-2xl border border-slate-200 bg-white shadow-sm px-3 sm:px-4 py-2 sm:py-3",children:e.jsx("input",{value:a,onChange:s=>v(s.target.value),placeholder:"Search news (team, player, source)…",className:`\r
                w-full h-10\r
                rounded-md\r
                bg-slate-50\r
                text-sm\r
                px-3\r
                border border-slate-300\r
                outline-none\r
                text-slate-800\r
                focus:ring-2 focus:ring-emerald-300\r
              `})}),e.jsx("div",{className:"flex items-center gap-2 overflow-x-auto pb-1",children:S.map(s=>e.jsxs("button",{onClick:()=>w(s.key),"aria-pressed":!!x[s.key],className:`
                  flex-shrink-0
                  h-8 sm:h-9 px-3 rounded-full
                  text-xs sm:text-sm
                  border
                  transition
                  focus:outline-none focus:ring-2 focus:ring-emerald-300
                  ${x[s.key]?"bg-emerald-100 text-emerald-900 border-emerald-300":"bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}
                `,children:[e.jsx("span",{className:"truncate max-w-[120px] sm:max-w-none",children:s.key}),e.jsxs("span",{className:"opacity-70 ml-1",children:["(",s.count,")"]})]},s.key))})]}),k?e.jsx("div",{className:"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4",children:Array.from({length:9}).map((s,t)=>e.jsx(L,{},t))}):e.jsxs("div",{className:"space-y-6 sm:space-y-8 mt-4",children:[Object.entries(j).map(([s,t])=>e.jsxs("section",{className:`\r
                  rounded-2xl\r
                  border border-slate-200\r
                  bg-white\r
                  shadow-sm\r
                  overflow-hidden\r
                `,children:[e.jsxs("button",{type:"button",onClick:()=>w(s),"aria-expanded":!!x[s],className:`\r
                    w-full\r
                    flex items-center justify-between\r
                    px-4 py-3\r
                    text-left\r
                    bg-slate-50\r
                    hover:bg-slate-100\r
                    transition\r
                    focus:outline-none focus:ring-2 focus:ring-emerald-300\r
                  `,children:[e.jsxs("div",{className:"flex items-center gap-3 min-w-0",children:[e.jsx("span",{className:"text-base sm:text-lg font-semibold text-emerald-700 truncate",children:s}),e.jsxs("span",{className:"text-[11px] sm:text-xs text-slate-500 whitespace-nowrap",children:[t.length," article",t.length!==1?"s":""]})]}),e.jsx("span",{className:"text-emerald-700 text-xs sm:text-sm",children:x[s]?"▲":"▼"})]}),x[s]&&e.jsx("div",{className:"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 p-3 sm:p-4",children:t.map((l,m)=>{var N,y;const r=l.topic==="FPL tips",n=((N=l.parsedSource)==null?void 0:N.url)||"",i=((y=l.parsedSource)==null?void 0:y.name)||"",p=$(n),u=e.jsxs("div",{className:`
                            h-full
                            rounded-xl
                            border
                            ${r?"border-emerald-300":"border-slate-200"}
                            bg-white
                            p-4
                            shadow-sm
                            transition
                            hover:shadow-md hover:-translate-y-1
                            flex flex-col
                          `,children:[e.jsxs("div",{className:"flex items-center justify-between gap-3 mb-2",children:[e.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[p?e.jsx("img",{src:p,alt:"",className:"h-4 w-4 object-contain flex-shrink-0",onError:O=>O.currentTarget.style.display="none"}):null,e.jsx("span",{className:"text-[11px] text-slate-500 truncate",children:i||(r?"FPL Tips":"")})]}),e.jsx("time",{className:"text-[11px] text-slate-500 flex-shrink-0",children:M(l.date)})]}),e.jsx("p",{className:"text-sm sm:text-[15px] leading-5 text-slate-700 whitespace-pre-line",children:l.content})]});return r?e.jsx("div",{children:u},m):e.jsx("a",{href:n||"#",target:"_blank",rel:"noopener noreferrer",className:"block text-inherit no-underline",children:u},m)})})]},s)),Object.keys(j).length===0&&e.jsx("div",{className:"text-center text-slate-600 py-10",children:"No articles match your search."})]})]})})}export{T as default};
