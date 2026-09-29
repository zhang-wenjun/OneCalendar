/** Only import settings from our pre-community development build. Never overwrite new settings. */
export async function renamedPluginData(current:unknown,adapter:{exists(path:string):Promise<boolean>;read(path:string):Promise<string>},configDir:string){
  if(current!=null)return current;
  const base=`${configDir}/plugins/task-calendar`;
  if(!await adapter.exists(`${base}/manifest.json`)||!await adapter.exists(`${base}/data.json`))return undefined;
  const manifest=JSON.parse(await adapter.read(`${base}/manifest.json`)) as Record<string,unknown>;
  if(!manifest||typeof manifest!=='object'||manifest.id!=='task-calendar'||manifest.name!=='TaskCalendar'||manifest.author!=='TaskCalendar')return undefined;
  const data=JSON.parse(await adapter.read(`${base}/data.json`)) as {settings?:{root?:unknown}};
  if(!data||typeof data!=='object'||!data.settings||typeof data.settings.root!=='string')throw Error('Legacy development settings are invalid; originals were preserved.');
  return data;
}
