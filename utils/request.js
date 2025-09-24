const BASE_URL = "https://1374188029-brba51y21c.ap-beijing.tencentscf.com"; // 改成你的 next
// const API_TOKEN = "<可选 token>";
function get(url, data={}){
  return new Promise((resolve,reject)=>{
    wx.request({
      url: BASE_URL + url,
      method: 'GET',
      data,
      header: {'Content-Type':'application/json'/*, ...(API_TOKEN?{Authorization:`Bearer ${API_TOKEN}`}:{})*/},
      success: res => res.statusCode===200 ? resolve(res.data) : reject(res.data||res),
      fail: reject
    })
  })
}
function post(url, data={}){
  return new Promise((resolve,reject)=>{
    wx.request({
      url: BASE_URL + url,
      method: 'POST',
      data,
      header: {'Content-Type':'application/json'/*, ...(API_TOKEN?{Authorization:`Bearer ${API_TOKEN}`}:{})*/},
      success: res => res.statusCode===200 ? resolve(res.data) : reject(res.data||res),
      fail: reject
    })
  })
}
module.exports = { get, post, BASE_URL };
