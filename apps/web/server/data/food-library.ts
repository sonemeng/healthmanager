// 预置候选食物池（spec 17 §2，2026-10-10 用户纠偏后口径）
//
// 本文件只收录【客观事实】：食物名称 + 分类 + 营养属性标签。
// 不预写任何推荐程度 / 食用量 / 建议——那些由应用内模型结合当期
// 异常/临界指标、在用药物、过敏史现场生成（防幻觉靠池子，个性化靠模型）。
//
// 内容依据：国家卫健委《成人高血压/高脂血症/糖尿病食养指南（2023 年版）》
// 及其引用的中国居民膳食指南原则。改池 = 改代码 + 发版。

export interface FoodCandidate {
  /** 食物名（中文，展示与生成均用此名） */
  name: string;
  /** 分类 key（对应 FOOD_CATEGORIES） */
  category: FoodCategoryKey;
  /** 客观营养属性标签（供模型判断参考，不下结论） */
  tags: string[];
}

export type FoodCategoryKey =
  | "staple"
  | "vegetable"
  | "protein"
  | "fruit"
  | "nuts_snacks"
  | "condiment"
  | "drinks_soup";

export const FOOD_CATEGORIES: ReadonlyArray<{
  key: FoodCategoryKey;
  label: string;
}> = [
  { key: "staple", label: "主食类" },
  { key: "vegetable", label: "蔬菜类" },
  { key: "protein", label: "蛋白质类（肉蛋豆奶）" },
  { key: "fruit", label: "水果类" },
  { key: "nuts_snacks", label: "坚果零食" },
  { key: "condiment", label: "调味品" },
  { key: "drinks_soup", label: "饮品汤类" },
];

// ── 候选池（每类 15-20 种，面向老人/体弱者，全谷物/杂豆/深色蔬菜过半）────

export const FOOD_CANDIDATES: readonly FoodCandidate[] = [
  // 主食类
  { name: "燕麦", category: "staple", tags: ["全谷物", "低GI", "高纤维", "质地细软"] },
  { name: "小米", category: "staple", tags: ["全谷物", "质地细软"] },
  { name: "糙米", category: "staple", tags: ["全谷物", "高纤维"] },
  { name: "荞麦", category: "staple", tags: ["全谷物", "低GI"] },
  { name: "玉米", category: "staple", tags: ["全谷物", "高纤维"] },
  { name: "藜麦", category: "staple", tags: ["全谷物", "优质蛋白"] },
  { name: "薏米", category: "staple", tags: ["全谷物", "质地细软"] },
  { name: "红薯", category: "staple", tags: ["薯类", "富钾", "低GI", "质地细软"] },
  { name: "紫薯", category: "staple", tags: ["薯类", "富钾", "低GI", "质地细软"] },
  { name: "山药", category: "staple", tags: ["薯类", "质地细软"] },
  { name: "土豆", category: "staple", tags: ["薯类", "富钾", "中GI"] },
  { name: "全麦面粉", category: "staple", tags: ["全谷物", "高纤维"] },
  { name: "绿豆", category: "staple", tags: ["杂豆", "低GI"] },
  { name: "红豆", category: "staple", tags: ["杂豆", "富钾", "高纤维", "质地需炖软"] },
  { name: "芸豆", category: "staple", tags: ["杂豆", "高纤维", "质地需炖软"] },
  { name: "燕麦片（即食）", category: "staple", tags: ["全谷物", "低GI", "质地细软"] },
  { name: "大米", category: "staple", tags: ["精制主食", "高GI（粥尤甚）", "质地细软"] },
  { name: "馒头", category: "staple", tags: ["精制主食", "质地细软"] },
  { name: "挂面", category: "staple", tags: ["精制主食", "含钠（隐形盐）"] },

  // 蔬菜类
  { name: "菠菜", category: "vegetable", tags: ["深色蔬菜", "富钾", "高草酸（建议焯水）"] },
  { name: "油菜", category: "vegetable", tags: ["深色蔬菜", "补钙", "质地细软"] },
  { name: "小白菜", category: "vegetable", tags: ["深色蔬菜", "补钙", "质地细软"] },
  { name: "芥蓝", category: "vegetable", tags: ["深色蔬菜", "富钾"] },
  { name: "空心菜", category: "vegetable", tags: ["深色蔬菜", "富钾"] },
  { name: "苋菜", category: "vegetable", tags: ["深色蔬菜", "富钾", "高草酸（建议焯水）"] },
  { name: "莴笋叶", category: "vegetable", tags: ["富钾", "质地细软"] },
  { name: "西兰花", category: "vegetable", tags: ["深色蔬菜", "高纤维"] },
  { name: "芹菜", category: "vegetable", tags: ["富钾", "高纤维"] },
  { name: "番茄", category: "vegetable", tags: ["富钾", "生熟皆宜", "质地细软"] },
  { name: "胡萝卜", category: "vegetable", tags: ["深色蔬菜", "富含胡萝卜素", "质地需炖软"] },
  { name: "南瓜", category: "vegetable", tags: ["深色蔬菜", "低GI", "质地细软"] },
  { name: "冬瓜", category: "vegetable", tags: ["低热量", "质地细软"] },
  { name: "黄瓜", category: "vegetable", tags: ["低热量", "生食方便"] },
  { name: "大白菜", category: "vegetable", tags: ["质地细软", "低热量"] },
  { name: "圆白菜", category: "vegetable", tags: ["质地细软", "高纤维"] },
  { name: "白萝卜", category: "vegetable", tags: ["质地细软"] },
  { name: "香菇", category: "vegetable", tags: ["高纤维", "菌菇类", "中嘌呤"] },
  { name: "口蘑", category: "vegetable", tags: ["富钾", "菌菇类", "中高嘌呤"] },
  { name: "木耳（干）", category: "vegetable", tags: ["高纤维", "富含铁", "质地需泡发炖软"] },
  { name: "海带", category: "vegetable", tags: ["富碘", "富钾", "质地需炖软"] },

  // 蛋白质类（肉蛋豆奶）
  { name: "鸡胸肉", category: "protein", tags: ["优质蛋白", "低脂", "质地需嫩煮"] },
  { name: "去皮鸡腿肉", category: "protein", tags: ["优质蛋白", "质地细软"] },
  { name: "瘦猪肉", category: "protein", tags: ["优质蛋白", "补铁"] },
  { name: "瘦牛肉", category: "protein", tags: ["优质蛋白", "补铁", "质地需炖软"] },
  { name: "三文鱼", category: "protein", tags: ["深海鱼", "富含ω-3脂肪酸", "优质蛋白"] },
  { name: "鲈鱼", category: "protein", tags: ["淡水鱼", "低脂", "刺少", "优质蛋白"] },
  { name: "鳕鱼", category: "protein", tags: ["低脂", "刺少", "优质蛋白", "质地细软"] },
  { name: "鲫鱼", category: "protein", tags: ["淡水鱼", "优质蛋白", "多刺（老人注意）"] },
  { name: "带鱼", category: "protein", tags: ["海水鱼", "富含ω-3脂肪酸", "质地细软"] },
  { name: "基围虾", category: "protein", tags: ["优质蛋白", "海鲜类（过敏原）", "中高胆固醇", "中高嘌呤"] },
  { name: "鸡蛋", category: "protein", tags: ["优质蛋白", "常见过敏原（蛋）", "质地细软"] },
  { name: "鹌鹑蛋", category: "protein", tags: ["优质蛋白", "质地细软"] },
  { name: "豆腐", category: "protein", tags: ["优质蛋白", "大豆制品（过敏原：大豆）", "质地细软", "补钙"] },
  { name: "豆腐皮", category: "protein", tags: ["优质蛋白", "大豆制品", "质地细软"] },
  { name: "豆浆（无糖）", category: "protein", tags: ["优质蛋白", "大豆制品（过敏原：大豆）", "质地细软"] },
  { name: "低脂牛奶", category: "protein", tags: ["优质蛋白", "补钙", "常见过敏原（奶/乳糖不耐）"] },
  { name: "脱脂牛奶", category: "protein", tags: ["优质蛋白", "补钙", "低脂", "常见过敏原（奶/乳糖不耐）"] },
  { name: "原味酸奶", category: "protein", tags: ["补钙", "质地细软", "常见过敏原（奶）", "注意含糖量"] },
  { name: "黑豆", category: "protein", tags: ["杂豆", "优质蛋白", "质地需炖软"] },
  { name: "鹰嘴豆", category: "protein", tags: ["杂豆", "优质蛋白", "高纤维", "质地需炖软"] },

  // 水果类
  { name: "香蕉", category: "fruit", tags: ["富钾", "质地细软", "中GI"] },
  { name: "橙子", category: "fruit", tags: ["富钾", "富含维生素C", "需去皮去籽"] },
  { name: "柚子", category: "fruit", tags: ["低GI", "富钾", "与部分药物相互作用（见禁止事项）"] },
  { name: "哈密瓜", category: "fruit", tags: ["富钾", "高糖分（控量）"] },
  { name: "猕猴桃", category: "fruit", tags: ["富含维生素C", "质地细软"] },
  { name: "草莓", category: "fruit", tags: ["低糖", "质地细软"] },
  { name: "蓝莓", category: "fruit", tags: ["低糖", "富含花青素", "质地细软"] },
  { name: "苹果", category: "fruit", tags: ["低GI", "高纤维（带皮）", "质地需削皮"] },
  { name: "梨", category: "fruit", tags: ["高纤维", "质地细软（炖煮更佳）"] },
  { name: "桃子", category: "fruit", tags: ["质地细软", "需去皮"] },
  { name: "火龙果", category: "fruit", tags: ["低GI", "质地细软"] },
  { name: "木瓜", category: "fruit", tags: ["质地细软"] },
  { name: "鲜枣", category: "fruit", tags: ["富含维生素C", "高糖分（控量）", "质地硬"] },
  { name: "葡萄", category: "fruit", tags: ["质地细软", "需去皮去籽"] },
  { name: "西瓜", category: "fruit", tags: ["高GI", "高糖分（控量）"] },
  { name: "荔枝", category: "fruit", tags: ["高糖分（控量）"] },

  // 坚果零食
  { name: "原味核桃", category: "nuts_snacks", tags: ["富含ω-3脂肪酸", "原味无盐", "质地硬（老人碾碎）"] },
  { name: "原味杏仁", category: "nuts_snacks", tags: ["富含维生素E", "原味无盐", "质地硬（老人碾碎）"] },
  { name: "原味巴旦木", category: "nuts_snacks", tags: ["原味无盐", "质地硬（老人碾碎）"] },
  { name: "原味腰果", category: "nuts_snacks", tags: ["原味无盐", "质地硬（老人碾碎）"] },
  { name: "原味开心果", category: "nuts_snacks", tags: ["原味无盐", "质地硬"] },
  { name: "原味花生", category: "nuts_snacks", tags: ["常见过敏原（花生）", "原味无盐", "质地硬（老人碾碎）"] },
  { name: "原味松子", category: "nuts_snacks", tags: ["原味无盐", "质地细软"] },
  { name: "原味南瓜子", category: "nuts_snacks", tags: ["原味无盐", "富含镁和锌", "质地硬"] },
  { name: "原味葵花籽", category: "nuts_snacks", tags: ["原味无盐", "富含维生素E", "质地硬"] },
  { name: "原味榛子", category: "nuts_snacks", tags: ["原味无盐", "质地硬（老人碾碎）"] },
  { name: "原味板栗", category: "nuts_snacks", tags: ["淀粉类坚果", "质地需炖软", "替代主食计"] },
  { name: "芝麻（原味）", category: "nuts_snacks", tags: ["补钙", "质地碾碎", "原味无盐"] },
  { name: "亚麻籽", category: "nuts_snacks", tags: ["富含ω-3脂肪酸", "建议磨粉"] },
  { name: "奇亚籽", category: "nuts_snacks", tags: ["高纤维", "建议泡软"] },
  { name: "无盐烤鹰嘴豆", category: "nuts_snacks", tags: ["高纤维", "优质蛋白", "无盐"] },

  // 调味品
  { name: "低钠盐（代盐）", category: "condiment", tags: ["部分氯化钾替代氯化钠", "肾功能异常者遵医嘱"] },
  { name: "低钠酱油", category: "condiment", tags: ["含钠（隐形盐，仍需控量）"] },
  { name: "生抽", category: "condiment", tags: ["含钠（隐形盐）"] },
  { name: "老抽", category: "condiment", tags: ["含钠（隐形盐）"] },
  { name: "蚝油", category: "condiment", tags: ["含钠（隐形盐）", "嘌呤偏高"] },
  { name: "陈醋/香醋", category: "condiment", tags: ["无糖", "调味增鲜可减盐"] },
  { name: "柠檬汁", category: "condiment", tags: ["代盐增味", "富含维生素C"] },
  { name: "葱、姜、蒜", category: "condiment", tags: ["天然增味", "低钠"] },
  { name: "花椒、八角等天然香料", category: "condiment", tags: ["天然增味", "零钠"] },
  { name: "豆瓣酱", category: "condiment", tags: ["高钠", "辛辣刺激"] },
  { name: "辣椒", category: "condiment", tags: ["辛辣刺激（胃肠弱者少用）"] },
  { name: "芝麻酱", category: "condiment", tags: ["补钙", "高脂（控量）"] },
  { name: "蜂蜜", category: "condiment", tags: ["高糖", "糖尿病者慎用"] },
  { name: "白糖", category: "condiment", tags: ["高糖（添加糖）"] },
  { name: "橄榄油", category: "condiment", tags: ["推荐油脂（单不饱和脂肪酸高）"] },
  { name: "亚麻籽油", category: "condiment", tags: ["推荐油脂（富含ω-3）", "适合凉拌不宜爆炒"] },
  { name: "味精/鸡精", category: "condiment", tags: ["含钠（隐形盐）"] },

  // 饮品汤类
  { name: "白开水", category: "drinks_soup", tags: ["每日 1500–1700ml（心肾功能正常时）"] },
  { name: "淡绿茶", category: "drinks_soup", tags: ["避免浓茶", "贫血者不随餐喝（影响铁吸收）"] },
  { name: "菊花茶", category: "drinks_soup", tags: ["无糖", "温和"] },
  { name: "大麦茶", category: "drinks_soup", tags: ["无糖", "温和"] },
  { name: "柠檬水", category: "drinks_soup", tags: ["无糖", "富含维生素C"] },
  { name: "蔬菜清汤", category: "drinks_soup", tags: ["去皮去油少盐"] },
  { name: "冬瓜汤", category: "drinks_soup", tags: ["低热量", "少盐烹调"] },
  { name: "番茄蛋汤", category: "drinks_soup", tags: ["少盐烹调", "质地细软"] },
  { name: "紫菜蛋花汤", category: "drinks_soup", tags: ["富碘", "少盐烹调"] },
  { name: "海带豆腐汤", category: "drinks_soup", tags: ["富碘补钙", "少盐烹调"] },
  { name: "绿豆汤", category: "drinks_soup", tags: ["少糖或不加糖"] },
  { name: "银耳羹", category: "drinks_soup", tags: ["质地细软", "少糖烹调"] },
  { name: "藕粉", category: "drinks_soup", tags: ["质地细软", "易吞咽", "热量计入主食"] },
  { name: "红豆汤", category: "drinks_soup", tags: ["杂豆", "少糖烹调"] },
  { name: "豆浆（无糖，饮品计）", category: "drinks_soup", tags: ["优质蛋白", "大豆制品（过敏原：大豆）"] },
  { name: "脱脂奶昔（无糖）", category: "drinks_soup", tags: ["补钙", "常见过敏原（奶）"] },
];

// ── 禁止事项池（客观事实条目；模型只挑选适用项并写针对成员的原因）────

export type ForbiddenType = "药物禁忌" | "疾病忌口" | "烹调注意";

export interface ForbiddenItem {
  type: ForbiddenType;
  item: string;
  /** 客观机制/原因（硬事实，模型可据此扩写为面向成员的说明） */
  reason: string;
  /** 关联指标（中文，供模型与成员指标匹配） */
  relatedMetrics: string[];
}

export const FORBIDDEN_POOL: readonly ForbiddenItem[] = [
  // 药物禁忌（药物-食物相互作用，硬事实）
  {
    type: "药物禁忌",
    item: "西柚（葡萄柚）及其果汁",
    reason:
      "呋喃香豆素抑制肝药酶 CYP3A4，与部分二氢吡啶类降压药（如硝苯地平）和他汀类降脂药同服会显著升高血药浓度",
    relatedMetrics: ["血压", "血脂"],
  },
  {
    type: "药物禁忌",
    item: "酒精（任何含酒精饮品）",
    reason:
      "与降压药同服易体位性低血压；与磺脲类降糖药/胰岛素同服易低血糖；与他汀类同服加重肝损伤；与对乙酰氨基酚同服加重肝毒性",
    relatedMetrics: ["血压", "血糖", "血脂", "肝功能"],
  },
  {
    type: "药物禁忌",
    item: "大量高钾食物（低钠盐/大量香蕉/土豆等）",
    reason:
      "服用保钾利尿剂（如螺内酯）或 ACEI/ARB 类降压药时，叠加高钾摄入有高血钾风险",
    relatedMetrics: ["血压", "肾功能", "血钾"],
  },
  {
    type: "药物禁忌",
    item: "浓茶、浓咖啡与服药同服",
    reason: "影响部分药物（如铁剂、部分抗生素）吸收，建议间隔 2 小时以上",
    relatedMetrics: ["血红蛋白", "缺铁性贫血用药"],
  },
  {
    type: "药物禁忌",
    item: "牛奶/钙剂与喹诺酮类、四环素类抗生素同服",
    reason: "钙离子与药物螯合影响吸收，建议间隔 2 小时以上",
    relatedMetrics: ["抗感染用药"],
  },
  {
    type: "药物禁忌",
    item: "大量富含维生素K 的食物（如每天大量菠菜、绿茶）",
    reason: "维生素K 拮抗华法林等抗凝药物的抗凝效果，服用华法林者应保持摄入量稳定",
    relatedMetrics: ["凝血功能"],
  },

  // 疾病忌口
  {
    type: "疾病忌口",
    item: "浓肉汤、动物内脏、贝类/鱼子、啤酒",
    reason: "高嘌呤饮食，尿酸升高或痛风急性期患者应严格限制",
    relatedMetrics: ["尿酸"],
  },
  {
    type: "疾病忌口",
    item: "含糖饮料、蜂蜜、精制甜点、白粥（快升糖）",
    reason: "高GI/高添加糖，血糖异常者应严格限制",
    relatedMetrics: ["血糖", "糖化血红蛋白"],
  },
  {
    type: "疾病忌口",
    item: "腌制食品（咸菜/腊肉/咸鱼）、加工肉（午餐肉/火腿）",
    reason: "高钠（隐形盐），高血压患者应严格限制",
    relatedMetrics: ["血压"],
  },
  {
    type: "疾病忌口",
    item: "油炸食品、动物油、动物内脏、奶油糕点（含反式脂肪）",
    reason: "高脂/高胆固醇/反式脂肪酸，血脂异常或脂肪肝患者应限制",
    relatedMetrics: ["血脂", "肝功能"],
  },
  {
    type: "疾病忌口",
    item: "杨桃",
    reason: "含神经毒素，肾功能不全者无法正常代谢，有中毒风险",
    relatedMetrics: ["肾功能"],
  },
  {
    type: "疾病忌口",
    item: "过烫食物与饮品（>65°C）",
    reason: "长期反复烫伤食管黏膜增加食管病变风险",
    relatedMetrics: ["消化道"],
  },

  // 烹调注意（面向老人/体弱者）
  {
    type: "烹调注意",
    item: "避免油炸、红烧重油、煎烤的烹调方式",
    reason: "油脂摄入失控且老人消化能力弱，建议蒸、煮、炖、焖、凉拌为主",
    relatedMetrics: ["血脂", "消化"],
  },
  {
    type: "烹调注意",
    item: "食物切小切碎、炖煮软烂",
    reason: "老人咀嚼与吞咽功能减退，细软食物质地可降低呛噎风险、提高进食量",
    relatedMetrics: ["消化", "营养状况"],
  },
  {
    type: "烹调注意",
    item: "少量多餐（三餐两点制）",
    reason: "老人食欲与胃容量下降，少量多餐有助于总摄入达标与血糖平稳",
    relatedMetrics: ["血糖", "营养状况"],
  },
  {
    type: "烹调注意",
    item: "用控盐勺定量放盐（全天 <5g），起锅再放盐",
    reason: "起锅放盐咸味附着表面、减盐不减味；全天总量控制",
    relatedMetrics: ["血压"],
  },
  {
    type: "烹调注意",
    item: "不重复用油、不用土榨毛油",
    reason: "反复加热的油与土榨油有害物（极性物质/黄曲霉毒素风险）偏高",
    relatedMetrics: ["血脂", "肝功能"],
  },
];

// 食养指南硬规则（写入 prompt 的客观约束，模型生成「食用量」时遵守）
export const DIETARY_HARD_RULES: readonly string[] = [
  "每天食物不少于 12 种，每周不少于 25 种",
  "每日食盐摄入不超过 5 克（含酱油、蚝油等隐形盐）",
  "每日烹调油控制在 25 克以内",
  "全谷物或杂豆占主食的 1/4 至 1/2",
  "每天蔬菜约 500 克，深色蔬菜占一半以上",
  "每天水果 200–350 克，选低糖水果为主",
  "优质蛋白（鱼、禽、蛋、瘦肉、大豆制品、低脂奶）应占全天蛋白的一半以上",
  "每周吃鱼 2 次或摄入 300–500g 鱼类（优先深海鱼）",
  "原味坚果每周 50–70 克（每天一小把）",
  "成人每日饮水 1500–1700 毫升（心肾功能正常时）",
  "老年人体质弱者：少量多餐、细软烹调（切小切碎、蒸煮炖焖为主）",
];
