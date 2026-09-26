// Host classes are irrelevant to eventsFor; keep its actual production implementation.
export class ItemView {}
export class Modal {}
export class Component {}
export class Notice {}
export class Plugin {registerObsidianProtocolHandler(){} }
export class PluginSettingTab {}
export class Setting {}
export class TFolder {}
export async function requestUrl(){throw Error('Network is disabled in unit tests');}
export const Platform={isMobile:false};
export const MarkdownRenderer={};
export {default as moment} from 'moment';
export const normalizePath=(path:string)=>path.replace(/\\/g,'/').replace(/\/+/g,'/').replace(/^\//,'');
export class TFile {constructor(public path:string){}}
import {StateField} from '@codemirror/state';
export const editorLivePreviewField=StateField.define<boolean>({create:()=>true,update:v=>v});

export function setIcon(){}

