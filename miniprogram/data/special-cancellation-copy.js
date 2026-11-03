// 特殊取消申请文案，与 Web 端 GuestSpecialCancellationPage 保持一致（Web 端仅提供中文）。
module.exports = {
  declarations: [
    '我知晓本订单的原本的取消规则。',
    '我理解此次提交属于特殊情况申请，并非正常免费取消。',
    '我理解提交申请及材料并不代表申请一定获得批准。',
    '我确认本次提交的信息及材料真实有效。',
  ],
  reasonCategories: ['个人原因', '不可抗力'],
  reasonSubcategories: {
    个人原因: ['个人原因'],
    不可抗力: ['航班列车异常', '突发疾病 / 住院', '政府管控', '身故'],
  },
  transportModes: ['飞机', '火车'],
  purposes: [
    { value: 'supporting', label: '其他材料' },
    { value: 'disruption', label: '班次异常' },
    { value: 'passenger', label: '本人购买／乘坐' },
  ],
  statusLabels: {
    awaiting_guest: '等待填写', pending_review: '待审核', need_more_info: '待补充材料', pending_call: '待电话沟通',
    approved: '已批准', rejected: '未批准', withdrawn: '已撤回', closed: '已结束',
  },
  eventLabels: {
    created: '创建申请', submitted: '提交申请', resubmitted: '提交补充资料', staff_note: '补充说明',
    approved: '审核通过', rejected: '审核未通过', need_more_info: '要求补充资料', closed: '完成后续处理',
  },
  actorLabels: { guest: '旅客', staff: '前台', admin: '管理员', system: '系统' },
}
