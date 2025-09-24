const mgr = wx.getRecorderManager();
function start(){
  return new Promise((resolve,reject)=>{
    mgr.onStart(()=>resolve(true));
    mgr.onError(err=>reject(err));
    mgr.start({ duration: 60000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 96000, format: 'mp3' });
  });
}
function stop(){
  return new Promise((resolve,reject)=>{
    mgr.onStop(res=>resolve(res.tempFilePath));
    mgr.onError(err=>reject(err));
    mgr.stop();
  });
}
module.exports = { start, stop };
