App({
  globalData: {
    userInfo: {
      nickname: '',
      avatarUrl: '',
      vipLevel: '普通会员',
      points: 0,
      balance: 0,
      isRegistered: false,
    },
    posts: [
      {
        id: 1,
        user: '糖糖',
        avatar: '🐱',
        level: '银卡',
        levelClass: 'silver',
        content: '今天做了超美的猫爪款！技师小雅太厉害了，完全按照我想要的风格做出来了，而且店里还有好多好看的花，整个环境超级治愈！强烈推荐给大家，真的是来了就不想走的地方。',
        colors: ['pink', 'coral'],
        likes: 42,
        commentCount: 3,
        points: 10,
        liked: false,
        time: '2小时前',
        tags: ['猫爪款', '小雅技师'],
        commentList: [
          { id: 1, user: '小桃子', avatar: '🌸', text: '好好看！在哪里预约的？', time: '1小时前', likes: 3, liked: false },
          { id: 2, user: 'Momo', avatar: '🐶', text: '猫爪款太可爱了！下次我也要做！', time: '45分钟前', likes: 1, liked: false },
          { id: 3, user: '可颜', avatar: '🦋', text: '小雅技师真的很棒，我也是她的粉丝！', time: '20分钟前', likes: 2, liked: false },
        ],
      },
      {
        id: 2,
        user: '小桃子',
        avatar: '🌸',
        level: '金卡',
        levelClass: 'gold',
        content: '第一次来第五季，环境超级好！花艺布置随季节变化，现在是春天主题，粉粉嫩嫩的好喜欢。带着我的猫咪一起来的，店员都超级喜欢它！做完美甲还给猫猫拍了好多照片哈哈哈。',
        colors: ['lavender', 'white'],
        likes: 65,
        commentCount: 4,
        points: 10,
        liked: true,
        time: '5小时前',
        tags: ['环境打卡', '宠物友好'],
        commentList: [
          { id: 1, user: '糖糖', avatar: '🐱', text: '你的猫咪太可爱了！是什么品种？', time: '4小时前', likes: 5, liked: false },
          { id: 2, user: 'Momo', avatar: '🐶', text: '环境真的很美，感觉每次来都不一样', time: '3小时前', likes: 2, liked: false },
          { id: 3, user: '可颜', avatar: '🦋', text: '金卡会员有专属服务吗？', time: '2小时前', likes: 0, liked: false },
          { id: 4, user: '小桃子', avatar: '🌸', text: '有的！金卡有专属折扣和优先预约哦', time: '1小时前', likes: 4, liked: false },
        ],
      },
      {
        id: 3,
        user: '可颜',
        avatar: '🦋',
        level: '银卡',
        levelClass: 'silver',
        content: '做了高定款镶嵌款式！可可技师的手艺真的绝了，每一颗宝石都摆得很精准，出门被好几个朋友问在哪里做的！VIP Room 的体验也超级棒，一个人独享，超级放松。',
        colors: ['gold', 'green'],
        likes: 88,
        commentCount: 2,
        points: 10,
        liked: false,
        time: '昨天',
        tags: ['高定款', 'VIP Room'],
        commentList: [
          { id: 1, user: '糖糖', avatar: '🐱', text: '高定款多少钱？', time: '昨天', likes: 1, liked: false },
          { id: 2, user: '可颜', avatar: '🦋', text: '1000起哦，VIP Room 值得！', time: '昨天', likes: 6, liked: false },
        ],
      },
      {
        id: 4,
        user: 'Momo',
        avatar: '🐶',
        level: '普通',
        levelClass: 'normal',
        content: '带着我的柯基来做美睫，他在等待区玩得超级开心！晓晓技师做的韩式美睫，眼睛瞬间放大了好多！强烈推荐给想要自然感美睫的姐妹。',
        colors: ['coral', 'lavender'],
        likes: 34,
        commentCount: 2,
        points: 10,
        liked: false,
        time: '前天',
        tags: ['韩式美睫', '宠物同行'],
        commentList: [
          { id: 1, user: '小桃子', avatar: '🌸', text: '柯基也太可爱了吧！', time: '前天', likes: 3, liked: false },
          { id: 2, user: '糖糖', avatar: '🐱', text: '下次也带我的猫猫一起来', time: '前天', likes: 2, liked: false },
        ],
      },
    ],
    nextPostId: 5,
    nextCommentId: 10,
  },

  onLaunch() {
    const stored = wx.getStorageSync('userInfo');
    if (stored && stored.isRegistered) {
      this.globalData.userInfo = stored;
    }
    // 加载预约数据
    const bookings = wx.getStorageSync('bookings');
    if (bookings) {
      this.globalData.bookings = bookings;
    }
  },

  saveUserInfo(info) {
    Object.assign(this.globalData.userInfo, info);
    wx.setStorageSync('userInfo', this.globalData.userInfo);
  },

  // 获取某技师某天的已预约时间段
  getBookedSlots(techId, date) {
    const bookings = this.globalData.bookings || [];
    const bookedSlots = [];
    bookings.forEach(booking => {
      if (booking.techId === techId && booking.date === date && booking.status !== 'cancelled') {
        // 根据开始时间和时长计算所有被占用的时间段
        const startMinutes = this.timeToMinutes(booking.time);
        const durationMinutes = this.parseDuration(booking.duration);
        const endMinutes = startMinutes + durationMinutes;
        
        // 生成所有被占用的时间点
        for (let m = startMinutes; m < endMinutes; m += 30) {
          bookedSlots.push(this.minutesToTime(m));
        }
      }
    });
    return bookedSlots;
  },

  // 添加预约
  addBooking(booking) {
    if (!this.globalData.bookings) {
      this.globalData.bookings = [];
    }
    const id = Date.now();
    const newBooking = { ...booking, id, status: 'confirmed', createTime: new Date().toISOString() };
    this.globalData.bookings.push(newBooking);
    wx.setStorageSync('bookings', this.globalData.bookings);
    return id;
  },

  // 取消预约
  cancelBooking(bookingId) {
    const bookings = this.globalData.bookings || [];
    const index = bookings.findIndex(b => b.id === bookingId);
    if (index !== -1) {
      bookings[index].status = 'cancelled';
      wx.setStorageSync('bookings', bookings);
      return true;
    }
    return false;
  },

  // 获取用户的所有预约
  getUserBookings(phone) {
    const bookings = this.globalData.bookings || [];
    return bookings.filter(b => b.phone === phone && b.status !== 'cancelled');
  },

  // 时间字符串转分钟数 (e.g., "10:30" -> 630)
  timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  },

  // 分钟数转时间字符串 (e.g., 630 -> "10:30")
  minutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  // 解析时长字符串转分钟数 (e.g., "90 分钟" -> 90)
  parseDuration(durationStr) {
    const match = durationStr.match(/(\d+)/);
    return match ? parseInt(match[1]) : 90;
  },

  addPost(post) {
    const id = this.globalData.nextPostId++;
    this.globalData.posts.unshift({ ...post, id, commentList: [], commentCount: 0 });
    return id;
  },

  getPostById(id) {
    return this.globalData.posts.find(p => p.id === id);
  },

  togglePostLike(postId) {
    const post = this.getPostById(postId);
    if (!post) return;
    post.liked = !post.liked;
    post.likes += post.liked ? 1 : -1;
  },

  addComment(postId, comment) {
    const post = this.getPostById(postId);
    if (!post) return null;
    const id = this.globalData.nextCommentId++;
    const newComment = { ...comment, id, likes: 0, liked: false };
    post.commentList.push(newComment);
    post.commentCount = post.commentList.length;
    return newComment;
  },
});
