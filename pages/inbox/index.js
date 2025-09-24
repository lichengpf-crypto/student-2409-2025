const { get } = require('../../utils/request');
Page({
  data:{ student_id:'', items:[], loading:false },
  onLoad(){
    const sid = wx.getStorageSync('student_id') || '';
    this.setData({ student_id: sid }, ()=>{ if (sid) this.refresh(); });
  },
  onInputId(e){ this.setData({ student_id: e.detail.value.trim() }) },
  saveId(){ wx.setStorageSync('student_id', this.data.student_id); wx.showToast({title:'已保存'}); },
  async refresh(){
    if (!this.data.student_id){ wx.showToast({title:'请先填写学生ID', icon:'none'}); return; }
    this.setData({ loading:true });
    try{
      const r = await get('/student/inbox', { student_id: this.data.student_id });
      this.setData({ items: r.items || [] });
    }catch(e){
      wx.showToast({title:'刷新失败', icon:'none'});
    }finally{
      this.setData({ loading:false });
    }
  },
  open(e){
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/assignment/index?aid=' + id + '&sid=' + this.data.student_id });
  }
});
