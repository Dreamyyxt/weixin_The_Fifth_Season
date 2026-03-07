const app = getApp();

const techMap = {
  1: { name: '小雅', title: '首席美甲师', avatar: '🧑‍🎨' },
  2: { name: '晓晓', title: '美睫专家', avatar: '👩‍🎨' },
  3: { name: '芊芊', title: '高级美甲师', avatar: '💁‍♀️' },
  4: { name: '可可', title: 'VIP 高定师', avatar: '👸' },
};

const serviceTypes = [
  { id: 1, name: '日式凝胶美甲', duration: '90 分钟', price: 300 },
  { id: 2, name: '高定款式美甲', duration: '120 分钟', price: 600 },
  { id: 3, name: '嫁接睫毛', duration: '90 分钟', price: 200 },
  { id: 4, name: '种植睫毛', duration: '120 分钟', price: 350 },
  { id: 5, name: '美甲 + 美睫组合', duration: '180 分钟', price: 499 },
  { id: 6, name: 'VIP 高定全套', duration: '240 分钟', price: 1000 },
];

const timeSlots = ['10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];

Page({
  data: {
    tech: null,
    techId: 1,
    services: serviceTypes,
    timeSlots: [],
    bookedSlots: [],
    selectedService: null,
    selectedDate: '',
    selectedTime: '',
    name: '',
    phone: '',
    remark: '',
    step: 1,
    bookingId: null,
  },

  onLoad(options) {
    const techId = parseInt(options.techId) || 1;
    const tech = techMap[techId] || techMap[1];
    const today = this.formatDate(new Date());
    this.setData({ tech, techId, selectedDate: today });
    this.loadAvailableTimeSlots();
  },

  onShow() {
    // 每次显示页面时重新加载可预约时间
    if (this.data.step === 1) {
      this.loadAvailableTimeSlots();
    }
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  // 加载可用时间段
  loadAvailableTimeSlots() {
    const { techId, selectedDate, selectedService } = this.data;
    
    // 获取已预约的时间段
    const bookedSlots = app.getBookedSlots(techId, selectedDate);
    
    // 根据选中的服务计算哪些时间段不可用
    const availableSlots = this.calculateAvailableSlots(bookedSlots, selectedService);
    
    this.setData({
      bookedSlots,
      timeSlots: availableSlots,
      selectedTime: '', // 重置选中的时间
    });
  },

  // 计算可用时间段
  calculateAvailableSlots(bookedSlots, service) {
    const slots = [];
    
    for (const time of timeSlots) {
      const startMinutes = app.timeToMinutes(time);
      const duration = service ? app.parseDuration(service.duration) : 30;
      const endMinutes = startMinutes + duration;
      
      // 检查这个时间段是否被占用
      let isAvailable = true;
      for (let m = startMinutes; m < endMinutes; m += 30) {
        const slotTime = app.minutesToTime(m);
        if (bookedSlots.includes(slotTime)) {
          isAvailable = false;
          break;
        }
      }
      
      if (isAvailable) {
        slots.push({ time, disabled: false });
      } else {
        slots.push({ time, disabled: true });
      }
    }
    
    return slots;
  },

  selectService(e) {
    const service = e.currentTarget.dataset.service;
    this.setData({ selectedService: service }, () => {
      this.loadAvailableTimeSlots();
    });
  },

  onDateChange(e) {
    const newDate = e.detail.value;
    // 检查是否选择了过去的日期
    const today = this.formatDate(new Date());
    if (newDate < today) {
      wx.showToast({ title: '不能选择过去的日期', icon: 'none' });
      return;
    }
    this.setData({ selectedDate: newDate, selectedTime: '' }, () => {
      this.loadAvailableTimeSlots();
    });
  },

  selectTime(e) {
    const timeInfo = e.currentTarget.dataset.timeinfo;
    if (timeInfo.disabled) {
      wx.showToast({ title: '该时间段已被预约', icon: 'none' });
      return;
    }
    this.setData({ selectedTime: timeInfo.time });
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
    const { name, phone, tech, techId, selectedService, selectedDate, selectedTime, remark } = this.data;
    if (!name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...' });
    
    // 保存预约到全局数据
    const bookingId = app.addBooking({
      techId,
      techName: tech.name,
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      duration: selectedService.duration,
      price: selectedService.price,
      date: selectedDate,
      time: selectedTime,
      name,
      phone,
      remark,
    });

    setTimeout(() => {
      wx.hideLoading();
      wx.showModal({
        title: '预约成功！',
        content: `您的预约已提交，我们将在当天为您发送确认通知。\n\n预约编号：${bookingId}\n技师：${tech.name}\n时间：${selectedDate} ${selectedTime}`,
        showCancel: false,
        confirmText: '好的',
        success: () => {
          // 跳转到个人中心或首页
          wx.switchTab({
            url: '/pages/profile/index',
          });
        },
      });
    }, 500);
  },
});
