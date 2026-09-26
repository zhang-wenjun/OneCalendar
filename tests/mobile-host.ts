// Minimal Obsidian DOM host; view, forms and storage run their production code.
const proto=HTMLElement.prototype as any;
proto.createEl=function(tag:string,o:any={}){const e=document.createElement(tag);if(o.cls)e.className=o.cls;if(o.text)e.textContent=o.text;for(const k of ['type','value','placeholder'])if(o[k]!==undefined)(e as any)[k]=o[k];for(const [k,v]of Object.entries(o.attr??{}))e.setAttribute(k,String(v));this.append(e);return e;};
proto.createDiv=function(o:any={}){return this.createEl('div',o);};proto.createSpan=function(o:any={}){return this.createEl('span',o);};
proto.empty=function(){this.replaceChildren();};proto.addClass=function(...c:string[]){this.classList.add(...c);};proto.toggleClass=function(c:string,b:boolean){this.classList.toggle(c,b);};proto.setText=function(t:string){this.textContent=t;};proto.appendText=function(t:string){this.append(document.createTextNode(t));};
export const Platform={isMobile:!location.search.includes('desktop')};
export class Component{register(){} }
export class ItemView{registerEvent(){} app:any={workspace:{openLinkText:async()=>{}}};contentEl=document.getElementById('app')!;addChild(c:any){return c;}removeChild(){} }
export class Modal{
 modalEl=document.createElement('section');titleEl=document.createElement('h2');contentEl=document.createElement('div');scope={register(){}};
 constructor(public app:any){this.modalEl.className='modal';this.modalEl.append(this.titleEl,this.contentEl);}
 open(){document.body.append(this.modalEl);(this as any).onOpen();}
 close(){(this as any).onClose?.();this.modalEl.remove();}
}
export class Notice{constructor(text:string){console.info(text);}}
export class Plugin{}
export class PluginSettingTab{}
export class Setting{}
export class TFile{constructor(public path:string){}}
export class TFolder{}
export const normalizePath=(path:string)=>path;
export {default as moment} from 'moment';
export async function requestUrl(){throw Error('Real network is disabled in browser UI fixtures');}
export const MarkdownRenderer={render:async(_app:any,text:string,el:HTMLElement)=>{el.textContent=text;}};

export function setIcon(parent:HTMLElement,name:string){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('data-icon',name);svg.setAttribute('aria-hidden','true');parent.replaceChildren(svg);}
