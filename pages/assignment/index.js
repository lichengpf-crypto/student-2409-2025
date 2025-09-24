// pages/assignment/index.js
// 作业详情（标题/备注/单词/对话逐条播放） + 录音重录/放弃（最多3次） + 提交
// 若未拿到 assignment_id，提供手动输入并加载
const recorder = wx.getRecorderManager();
let recAudio = null;   // 学生录音播放器
let ttsAudio = null;   // TTS 逐条播放器

let postJson = null, getJson = null;
try {
  const req = require('../../utils/request.js');
  postJson = req.postJson || null;
  getJson  = req.getJson  || null;
} catch(e){}

function httpGetJson(url){
  return new Promise((resolve, reject)=>{
    if (getJson){ getJson(url).then(resolve).catch(reject); return; }
    wx.request({ url, method:'GET',
      success: (res)=> (res.statusCode>=200&&res.statusCode<300)?resolve(res.data):reject(new Error('HTTP '+res.statusCode)),
      fail: reject });
  });
}
function httpPostJson(url, data){
  return new Promise((resolve, reject)=>{
    if (postJson){ postJson(url, data).then(resolve).catch(reject); return; }
    wx.request({ url, method:'POST', data, header:{'Content-Type':'application/json'},
      success: (res)=> (res.statusCode>=200&&res.statusCode<300)?resolve(res.data):reject(new Error('HTTP '+res.statusCode)),
      fail: reject });
  });
}

Page({
  data:{
    assignment_id: '',
    student_id: '',
    manualAid: '',        // 手动输入的 assignment_id
    baseUrl: '',

    // 作业详情
    loadingAssign:false,
    assignTitle:'',
    assignNote:'',
    wordItems:[],         // [{id,text,displayText,fileUrl}]
    dialogItems:[],
    playingTtsId:'',

    // 录音/提交
    recording:false,
    recordingFilePath:'',
    recordingDurationMs:0,
    durationSec:0,
    fileSizeKB:0,
    playingRec:false,

    attemptCount:0,
    MAX_ATTEMPTS:3,
    uploading:false,
    submission_id:'',
    submitRespRaw:''
  },

  onLoad(options){
    // BASE_URL
    let baseUrl = '';
    try { const cfg = require('../../config.js'); baseUrl = (cfg.BASE_URL || '').replace(/\/+$/,''); } catch(e){}
    // 上游参数
    let aid = (options && options.assignment_id) ? options.assignment_id : (this.data.assignment_id || '');
    let sid = (options && options.student_id)    ? options.student_id    : (this.data.student_id    || '');
    // 兜底：看看本地是否缓存了最近的 assignment_id（老师发布后可能写入）
    if (!aid){
      try { aid = wx.getStorageSync('lastAssignmentId') || ''; } catch(e){}
    }
    this.setData({ baseUrl, assignment_id: aid, student_id: sid, manualAid: aid });

    // 设备就绪
    recorder.onStart(()=>{
      this.setData({ recording:true, recordingDurationMs:0, durationSec:0, recordingFilePath:'' });
      this._tickStart();
    });
    recorder.onStop((res)=>{
      this._tickStop();
      const path = res.tempFilePath || '';
      const durS = Math.round((res.duration || 0)/1000);
      this._calcFileSize(path).then(kb=>{
        this.setData({ recording:false, recordingFilePath:path, recordingDurationMs:res.duration||0, durationSec:durS, fileSizeKB:kb });
        wx.showToast({ title:'已录制', icon:'success' });
      }).catch(()=>{
        this.setData({ recording:false, recordingFilePath:path, recordingDurationMs:res.duration||0, durationSec:durS, fileSizeKB:0 });
        wx.showToast({ title:'已录制', icon:'success' });
      });
    });
    recorder.onError(()=>{ this._tickStop(); this.setData({ recording:false }); wx.showToast({ title:'录音失败', icon:'none' }); });

    recAudio = wx.createInnerAudioContext(); recAudio.obeyMuteSwitch=false;
    recAudio.onEnded(()=> this.setData({ playingRec:false }));
    recAudio.onStop (()=> this.setData({ playingRec:false }));
    recAudio.onError(()=>{ this.setData({ playingRec:false }); wx.showToast({ title:'播放失败', icon:'none' }); });

    ttsAudio = wx.createInnerAudioContext(); ttsAudio.obeyMuteSwitch=false;
    ttsAudio.onEnded(()=> this.setData({ playingTtsId:'' }));
    ttsAudio.onStop (()=> this.setData({ playingTtsId:'' }));
    ttsAudio.onError(()=>{ this.setData({ playingTtsId:'' }); wx.showToast({ title:'TTS播放失败', icon:'none' }); });

    // 自动拉取作业
    if (baseUrl && aid) this.fetchAssignment(aid);
  },

  onUnload(){
    this._tickStop();
    try { recAudio && recAudio.destroy(); } catch(e){}
    try { ttsAudio && ttsAudio.destroy(); } catch(e){}
  },

  // ====== 手动加载作业 ======
  onAidInput(e){ this.setData({ manualAid: (e.detail && e.detail.value) ? e.detail.value.trim() : '' }); },
  onLoadAssignmentTap(){
    const aid = (this.data.manualAid || '').trim();
    if (!aid){ wx.showToast({ title:'请输入作业ID', icon:'none' }); return; }
    if (!this.data.baseUrl){ wx.showToast({ title:'未配置 BASE_URL', icon:'none' }); return; }
    this.setData({ assignment_id: aid });
    try { wx.setStorageSync('lastAssignmentId', aid); } catch(e){}
    this.fetchAssignment(aid);
  },

  // ====== 获取作业详情 ======
  async fetchAssignment(aid){
    this.setData({ loadingAssign:true, wordItems:[], dialogItems:[], playingTtsId:'' });
    try{
      const url = `${this.data.baseUrl}/assignments/get/${encodeURIComponent(aid)}`;
      const data = await httpGetJson(url);
      const a = (data && data.assignment) ? data.assignment : {};
      const srcItems = Array.isArray(a.items) ? a.items : [];

      const norm = srcItems.map((it)=>{
        // 统一 fileUrl
        let fu = it.fileUrl || '';
        if (fu && fu.indexOf('http') !== 0){
          fu = fu.startsWith('/') ? (this.data.baseUrl + fu) : (this.data.baseUrl + '/' + fu);
        }
        // 组装展示文本（避免 WXML 运算）
        let displayText = (it.text || '');
        if (it.type === 'dialogue'){
          const sp = (it.speaker || '').trim();
          displayText = sp ? (sp + ': ' + displayText) : displayText;
        }
        return {
          id: it.id || '',
          type: it.type || '',
          text: it.text || '',
          speaker: it.speaker || '',
          displayText,
          fileUrl: fu
        };
      });

      this.setData({
        assignTitle: a.title || '',
        assignNote : a.note  || '',
        wordItems  : norm.filter(x=>x.type==='word'),
        dialogItems: norm.filter(x=>x.type==='dialogue')
      });
    }catch(err){
      console.error('fetchAssignment error', err);
      wx.showToast({ title:'作业详情获取失败', icon:'none' });
    }finally{
      this.setData({ loadingAssign:false });
    }
  },

  // ====== TTS 逐条播放 ======
  onPlayTts(e){
    const id = e.currentTarget.dataset.id || '';
    const url = e.currentTarget.dataset.url || '';
    if (!url) return;
    if (this.data.playingTtsId === id){
      try{ ttsAudio.stop(); }catch(e){}
      this.setData({ playingTtsId:'' });
      return;
    }
    try{ ttsAudio.stop(); }catch(e){}
    ttsAudio.src = url;
    ttsAudio.play();
    this.setData({ playingTtsId:id });
  },

  // ====== 录音 ======
  onStartRecord(){
    if (this.data.attemptCount >= this.data.MAX_ATTEMPTS && !this.data.recordingFilePath){
      wx.showToast({ title:`已达重录上限（${this.data.MAX_ATTEMPTS}次）`, icon:'none' }); return;
    }
    recorder.start({ duration:120000, format:'mp3', numberOfChannels:1, encodeBitRate:48000 });
  },
  onStopRecord(){ if (this.data.recording) recorder.stop(); },
  onTogglePlayRec(){
    if (!this.data.recordingFilePath){ wx.showToast({ title:'请先录音', icon:'none' }); return; }
    if (this.data.playingRec){ recAudio.stop(); this.setData({ playingRec:false }); return; }
    recAudio.src = this.data.recordingFilePath;
    recAudio.play();
    this.setData({ playingRec:true });
  },
  onReRecord(){
    const left = this.data.MAX_ATTEMPTS - this.data.attemptCount;
    if (left <= 0 && this.data.recordingFilePath){
      wx.showToast({ title:`已达重录上限（${this.data.MAX_ATTEMPTS}次）`, icon:'none' }); return;
    }
    if (!this.data.recordingFilePath){ this.onStartRecord(); return; }
    wx.showModal({
      title:'确认重录？',
      content:`丢弃当前录音。上限：${this.data.MAX_ATTEMPTS} 次，已用：${this.data.attemptCount} 次`,
      success:(d)=>{
        if (d.confirm){
          this.setData({ recordingFilePath:'', recordingDurationMs:0, durationSec:0, fileSizeKB:0, attemptCount:this.data.attemptCount+1 });
          this.onStartRecord();
        }
      }
    });
  },
  onAbort(){
    wx.showModal({
      title:'放弃本次录音？',
      content:'将清空已录音与重录次数',
      success:(d)=>{
        if (d.confirm){
          try{ recAudio.stop(); }catch(e){}
          this.setData({
            recording:false, recordingFilePath:'', recordingDurationMs:0, durationSec:0,
            fileSizeKB:0, playingRec:false, attemptCount:0
          });
          wx.showToast({ title:'已清空', icon:'none' });
        }
      }
    });
  },

  // ====== 提交 ======
  async onSubmit(){
    if (!this.data.assignment_id || !this.data.student_id){ wx.showToast({ title:'缺少 assignment_id/student_id', icon:'none' }); return; }
    if (!this.data.recordingFilePath){ wx.showToast({ title:'请先录音', icon:'none' }); return; }
    if (!this.data.baseUrl){ wx.showToast({ title:'未配置 BASE_URL', icon:'none' }); return; }
    if (this.data.uploading) return;

    this.setData({ uploading:true });
    try{
      const b64 = await this._readFileAsBase64(this.data.recordingFilePath);
      const url = `${this.data.baseUrl}/submissions/create`;
      const resp = await httpPostJson(url, { assignment_id:this.data.assignment_id, student_id:this.data.student_id, audio_b64:b64 });
      const sid = (resp && resp.submission_id) ? resp.submission_id : '';
      this.setData({ submission_id:sid, submitRespRaw: JSON.stringify(resp||{}, null, 2) });
      if (resp && resp.ok){
        wx.showModal({ title:'提交成功', content: sid?`编号：${sid}`:'已提交', showCancel:false, confirmText:'好的' });
      }else{
        wx.showToast({ title:'提交失败', icon:'none' });
      }
    }catch(e){
      console.error(e);
      wx.showToast({ title:'提交失败', icon:'none' });
    }finally{
      this.setData({ uploading:false });
    }
  },

  // ====== 工具 ======
  _readFileAsBase64(path){
    return new Promise((resolve, reject)=>{
      wx.getFileSystemManager().readFile({ filePath:path, encoding:'base64',
        success:(res)=> resolve(res.data), fail:reject });
    });
  },
  _calcFileSize(path){
    return new Promise((resolve, reject)=>{
      wx.getFileSystemManager().getFileInfo({ filePath:path,
        success:(res)=> resolve(Math.round((res.size||0)/102.4)/10),
        fail: reject });
    });
  },
  _tickStart(){
    if (this._timer) return;
    const start = Date.now();
    this._timer = setInterval(()=>{ const ms = Date.now()-start; this.setData({ recordingDurationMs:ms, durationSec:Math.round(ms/1000) }); }, 200);
  },
  _tickStop(){ if (this._timer){ clearInterval(this._timer); this._timer=null; } }
});

