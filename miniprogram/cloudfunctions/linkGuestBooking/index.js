const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 将游客订单关联到已注册会员
 * action = 'search' : 按手机号或会员号搜索会员，返回预览信息
 * action = 'link'   : 执行关联，将 bookingId 的 userId 写入 memberOpenId
 *
 * event (search): { action: 'search', query }
 * event (link):   { action: 'link', bookingId, memberOpenId }
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  // 权限：仅管理员可操作
  let caller;
  try {
    const res = await db.collection('users').doc(OPENID).get();
    caller = res.data;
  } catch (e) {
    return { success: false, error: '用户不存在' };
  }
  if (caller.role !== 'admin') return { success: false, error: '无权限' };

  const { action } = event;

  // ── 搜索会员 ──────────────────────────────────────────────────────────────
  if (action === 'search') {
    const query = (event.query || '').trim();
    if (!query) return { success: false, error: '请输入手机号或会员号' };

    // 先按手机号找，再按会员号找
    let member = null;
    const byPhone = await db.collection('users')
      .where({ phone: query })
      .limit(1)
      .get();
    if (byPhone.data.length > 0) {
      member = byPhone.data[0];
    } else {
      const byMemberNo = await db.collection('users')
        .where({ memberNo: query })
        .limit(1)
        .get();
      if (byMemberNo.data.length > 0) member = byMemberNo.data[0];
    }

    if (!member) return { success: false, error: '未找到该会员，请确认手机号或会员号' };

    return {
      success: true,
      member: {
        openId:    member._id,
        nickname:  member.nickname || '未设置昵称',
        phone:     member.phone || '',
        memberNo:  member.memberNo || '',
        vipLevel:  member.vipLevel || '普通会员',
        avatarUrl: member.avatarUrl || '',
      },
    };
  }

  // ── 执行关联 ──────────────────────────────────────────────────────────────
  if (action === 'link') {
    const { bookingId, memberOpenId } = event;
    if (!bookingId || !memberOpenId) return { success: false, error: '缺少参数' };

    // 获取订单
    let booking;
    try {
      const res = await db.collection('bookings').doc(bookingId).get();
      booking = res.data;
    } catch (e) {
      return { success: false, error: '订单不存在' };
    }

    if (booking.userId && booking.userId !== '') {
      return { success: false, error: '该订单已关联会员' };
    }

    // 确认目标会员存在
    let member;
    try {
      const res = await db.collection('users').doc(memberOpenId).get();
      member = res.data;
    } catch (e) {
      return { success: false, error: '会员不存在' };
    }

    // 更新订单 userId，清除 isGuest 标记
    await db.collection('bookings').doc(bookingId).update({
      data: {
        userId:  memberOpenId,
        isGuest: false,
      },
    });

    // 若订单已完成/已付款，累加到会员 totalSpend
    if ((booking.status === 'completed' || booking.status === 'paid') &&
        booking.paymentStatus === 'paid') {
      const amount = booking.finalPrice !== undefined && booking.finalPrice !== null
        ? booking.finalPrice
        : (booking.price || 0);
      await db.collection('users').doc(memberOpenId).update({
        data: { totalSpend: db.command.inc(amount) },
      });
    }

    return {
      success: true,
      memberName: member.nickname || '未设置昵称',
    };
  }

  return { success: false, error: '未知操作' };
};
