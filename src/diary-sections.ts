export type DiarySection='Tasks'|'Journal'|'Ideas';
export const diaryTemplate='## Tasks\n\n- [ ] \n\n## Journal\n\n\n## Ideas\n\n- \n';
// Share one heading scanner between reads and writes. Examples and comments never create sections.
export function diarySections(raw:string){
  const lines=raw.split(/\r?\n/), sections:{name:string;start:number;end:number}[]=[];
  let fence='',comment=false,front=false;
  for(let i=0;i<lines.length;i++){
    const line=lines[i];if(i===0&&line==='---'){front=true;continue;}
    if(front){if(line==='---'||line==='...')front=false;continue;}
    if(comment){if(line.includes('-->'))comment=false;continue;}
    const f=line.match(/^\s{0,3}(`{3,}|~{3,})/);if(f){if(!fence)fence=f[1];else if(f[1][0]===fence[0]&&f[1].length>=fence.length)fence='';continue;}if(fence)continue;
    if(line.trimStart().startsWith('<!--')){comment=!line.includes('-->');continue;}
    const h=line.match(/^ {0,3}(#{1,2})\s+(.+?)\s*#*\s*$/);if(!h)continue;
    if(sections.length)sections[sections.length-1].end=i;
    sections.push({name:h[1].length===2?h[2]:'',start:i,end:lines.length});
  }return sections;
}
export function appendDiaryEntry(raw:string,section:DiarySection,entry:string){
  const matches=diarySections(raw).filter(s=>s.name===section);
  if(matches.length>1)throw Error(`Multiple ${section} sections; merge them before adding a record.`);
  const eol=raw.includes('\r\n')?'\r\n':'\n';const content=entry.replace(/\r?\n/g,eol);
  if(!matches.length)return raw+(raw.endsWith('\n')?'':'\n')+eol+`## ${section}`+eol+eol+content+eol;
  const lines=raw.split(/(?<=\n)/),at=matches[0].end;
  const before=lines.slice(0,at).join(''),after=lines.slice(at).join('');
  return before+(before.endsWith('\n')?'':eol)+eol+content+eol+(after?eol+after:'');
}
