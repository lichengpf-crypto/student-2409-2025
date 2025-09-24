// pages/Result/index.js
let getJson = null;
try {
  const req = require('../../utils/request.js');
  getJson = req.getJson || null;
} catch(e){}

function httpGetJson(url){
  return new Promise((resolve, reject) => {
    if (getJson) {
      getJson(url).then(resolve).catch(reject);
      return;
    }
    wx.request({
      url,
      method: 'GET',
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new Error('HTTP ' + res.statusCode));
      },
      fail: reject
    });
  });
}

Page({
  data: {
    submissionId: '',
    baseUrl: '',
    isLoading: false,
    hasResult: false,
    statusText: '',
    overall: null,
    recognizedText: '',
    rawJson: ''
  },

  onLoad(options){
    // 支持从路由参数注入 submission_id
    const submissionId = options && options.submission_id ? options.submission_id : '';
    let baseUrl = '';
    try {
      const cfg = require('../../config.js');
      baseUrl = cfg.BASE_URL || '';
    } catch(e){}
    this.setData({ submissionId, baseUrl });
  },

  onInputId(e){
    this.setData({ submissionId: (e.detail.value || '').trim() });
  },

  async onQueryScore(){
    const id = this.data.submissionId.trim();
    const base = this.data.baseUrl;
    if (!id) {
      wx.showToast({ title: '请先输入 submission_id', icon: 'none' });
      return;
    }
    if (!base) {
      wx.showToast({ title: '未配置 BASE_URL', icon: 'none' });
      return;
    }
    this.setData({ isLoading: true, hasResult: false });
    try {
      const url = `${base}/results/${encodeURIComponent(id)}`;
      const data = await httpGetJson(url);

      const status = (data && data.status) || '';
      let statusText = '';
      let overall = null;
      let recognizedText = '';

      if (status === 'pending') {
        statusText = '等待老师统一评分…';
      } else if (status === 'stt_failed') {
        statusText = '识别失败（老师会复核或通知重录）';
      } else if (status === 'scored') {
        statusText = '评分完成';
        overall = data.result && data.result.scores ? data.result.scores.overall : null;
        recognizedText = data.result && data.result.recognizedText ? data.result.recognizedText : '';
      } else {
        statusText = `未知状态：${status}`;
      }

      this.setData({
        statusText,
        overall,
        recognizedText,
        rawJson: JSON.stringify(data, null, 2),
        hasResult: true
      });
    } catch (err) {
      wx.showToast({ title: '查询失败', icon: 'none' });
      this.setData({ rawJson: String(err) });
    } finally {
      this.setData({ isLoading: false });
    }
  }
});
