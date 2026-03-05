const techMap = {
  1: { name: '小雅', title: '首席美甲师', avatar: '🧑‍🎨' },
  2: { name: '晓晓', title: '美睫专家', avatar: '👩‍🎨' },
  3: { name: '芊芊', title: '高级美甲师', avatar: '💁‍♀️' },
  4: { name: '可可', title: 'VIP 高定师', avatar: '👸' },
};

const serviceTypes = [
  { id: 1, name: '日式凝胶美甲', duration: '90分钟', price: 300 },
  { id: 2, name: '高定款式美甲', duration: '120分钟', price: 600 },
  { id: 3, name: '嫁接睫毛', duration: '90分钟', price: 200 },
  { id: 4, name: '种植睫毛', duration: '120分钟', price: 350 },
  { id: 5, name: '美甲+美睫组合', duration: '180分钟', price: 499 },
  { id: 6, name: 'VIP 高定全套', duration: '240分钟', price: 1000 },
];

const timeSlots = ['10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];

Page({
  data: {
    tech: null,
    services: serviceTypes,
    timeSlots,
    selectedService: null,
    selectedDate: '',
    selectedTime: '',
    name: '',
    phone: '',
    remark: '',
    step: 1,
  },

  onLoad(options) {
    const techId = parseInt(options.techId) || 1;
    const tech = techMap[techId] || techMap[1];
    const today = this.formatDate(new Date());
    this.setData({ tech, selectedDate: today });
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  selectService(e) {
    const service = e.currentTarget.dataset.service;
    this.setData({ selectedService: service });
  },

  onDateChange(e) {
    this.setData({ selectedDate: e.detail.value });
  },

  selectTime(e) {
    this.setData({ selectedTime: e.currentTarget.dataset.time });
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  nextStep() {
    const { selectedService, selectedDate, selectedTime } = this.data;
    if (!selectedService) {
      wx.showToast({ title: '请选择服务项目', icon: 'none' });
      return;
    }
    if (!selectedDate) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    if (!selectedTime) {
      wx.showToast({ title: '请选择时间', icon: 'none' });
      return;
    }
    this.setData({ step: 2 });
  },

  prevStep() {
    this.setData({ step: 1 });
  },

  submitBooking() {
    const { name, phone } = this.data;
    if (!name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...' });
    setTimeout(() => {
      wx.hideLoading();
      wx.showModal({
        title: '预约成功！',
        content: `您的预约已提交，我们将在当天为您发送确认通知。\n\n技师：${this.data.tech.name}\n时间：${this.data.selectedDate} ${this.data.selectedTime}`,
        showCancel: false,
        confirmText: '好的',
        success: () => {
          wx.navigateBack();
        },
      });
    }, 1000);
  },
});
