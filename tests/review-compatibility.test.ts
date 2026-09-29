import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendDiaryEntry} from '../src/diary-sections';

test('Section appends preserve empty, LF, CRLF and final lines without lookbehind',()=>{
 for(const newline of ['\n','\r\n'])for(const tail of ['',newline]){
  const original=['## Tasks','','- [ ] Keep','', '## Journal','Do not change this', '', '## Ideas','- Old idea'].join(newline)+tail;
  const result=appendDiaryEntry(original,'Tasks','- [ ] Added');
  assert.equal(result.slice(result.indexOf('## Journal')),original.slice(original.indexOf('## Journal')));
  assert.ok(result.includes('- [ ] Added'+newline));
  if(newline==='\r\n')assert.ok(!result.replaceAll('\r\n','').includes('\n'));
 }
 assert.ok(appendDiaryEntry('', 'Ideas', '- First').includes('## Ideas\n\n- First\n'));
});
