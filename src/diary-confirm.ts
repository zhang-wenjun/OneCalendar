import {App,Modal} from 'obsidian';
export function confirmDiary(app:App,day:string):Promise<boolean>{
  return new Promise(resolve=>{
    class Confirmation extends Modal {
      accepted=false;
      onOpen(){
        this.titleEl.setText(`Create diary for ${day}?`);
        this.contentEl.addClass('tc-form');
        const row=this.contentEl.createDiv({cls:'tc-form-actions'});
        row.createEl('button',{text:'Cancel'}).onclick=()=>this.close();
        row.createEl('button',{text:'Create',cls:'mod-cta'}).onclick=()=>{this.accepted=true;this.close();};
      }
      onClose(){resolve(this.accepted);this.contentEl.empty();}
    }
    new Confirmation(app).open();
  });
}
