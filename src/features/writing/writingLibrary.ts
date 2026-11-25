import { GREETINGS_WRITING } from "../english/greetingsCourseContent";
import type { WritingTopic } from "../english/types";

interface ChineseWritingTask {
  title: string;
  prompt: string;
  requiredPoints: readonly string[];
}

const CHINESE_WRITING_TASKS: readonly ChineseWritingTask[] = [
  { title: "初次见面", prompt: "请用英语写一段你与新同学或新同事初次见面的简短对话。", requiredPoints: ["打招呼并介绍对方", "询问并回应对方近况", "用礼貌的话结束对话"] },
  { title: "礼貌求助", prompt: "请用英语写一段向陌生人求助后发现找错人时的礼貌对话。", requiredPoints: ["用 Excuse me 开场", "为找错人道歉", "用感谢的话结束"] },
  { title: "个人信息", prompt: "请用英语向一位来自其他国家的新朋友介绍自己。", requiredPoints: ["说出姓名", "说明来自哪里", "询问或说明年龄"] },
  { title: "介绍他人", prompt: "请用英语写一段在家庭聚会上介绍两个人认识的对话。", requiredPoints: ["先向双方问好", "分别介绍姓名", "使用见面时的礼貌表达"] },
  { title: "职业对话", prompt: "请用英语写一段两人谈论职业的对话。", requiredPoints: ["介绍其中一人", "询问工作情况", "提到两种职业"] },
  { title: "询问时间", prompt: "请用英语写一段乘火车前询问时间的对话。", requiredPoints: ["询问现在几点", "询问火车情况", "写出一个准确时间"] },
  { title: "日期与生日", prompt: "请用英语写一份包含星期和日期的生日计划。", requiredPoints: ["说明星期", "说明日期", "提到庆祝活动"] },
  { title: "家乡天气", prompt: "请用英语描述家乡不同季节的天气。", requiredPoints: ["介绍家乡", "描述至少两个季节", "每句使用一个天气词"] },
  { title: "电话留言", prompt: "请用英语给不在家的朋友写一条电话留言。", requiredPoints: ["请求与对方通话", "留下姓名或留言", "请对方回电"] },
  { title: "预约看病", prompt: "请用英语写一段打电话预约医生的对话。", requiredPoints: ["说明来电原因", "说出姓名", "约定一个时间"] },
  { title: "酒店服务", prompt: "请用英语写一段向酒店申请送餐或叫醒服务的对话。", requiredPoints: ["说明房间号或需求", "礼貌提出请求", "如有需要说出时间"] },
  { title: "购物付款", prompt: "请用英语写一段购买一件价钱合适商品的店铺对话。", requiredPoints: ["询问价格", "说明价格是否合适", "决定是否购买"] },
  { title: "餐厅点餐", prompt: "请用英语写一段两个人在餐厅点餐的对话。", requiredPoints: ["询问餐桌", "点食物和饮料", "说明一项偏好"] },
  { title: "服装购物", prompt: "请用英语写一段试穿并购买衣服的对话。", requiredPoints: ["要求看一件商品", "说明尺码", "提到价格或促销"] },
  { title: "百货商店", prompt: "请用英语写一段购买生日礼物或试穿连衣裙的对话。", requiredPoints: ["说明需要什么", "追问一个问题", "用感谢的话结束"] },
  { title: "购买鞋子", prompt: "请用英语写一段根据尺码和舒适度购买鞋子的对话。", requiredPoints: ["询问尺码", "描述是否合脚", "选择另一双或结束购物"] },
  { title: "书店找书", prompt: "请用英语写一段在书店寻找一本书或字典的对话。", requiredPoints: ["说出书或字典名称", "询问版本或装帧", "选择一本书"] },
  { title: "乘坐出租车", prompt: "请用英语写一段乘出租车去车站或机场的对话。", requiredPoints: ["说明目的地", "询问车费", "如赶时间则说明时间"] },
  { title: "预订酒店", prompt: "请用英语写一段预订一到两晚酒店房间的对话。", requiredPoints: ["询问房型", "说明住宿天数", "询问或接受价格"] },
  { title: "酒店入住", prompt: "请用英语写一段包含预订信息和付款方式的酒店入住对话。", requiredPoints: ["说明姓名或预订信息", "回答证件或付款问题", "确认房间信息"] },
  { title: "兑换货币", prompt: "请用英语写一段在银行兑换货币的对话。", requiredPoints: ["说明持有的货币", "说明想兑换的货币", "询问汇率"] },
  { title: "预订机票", prompt: "请用英语写一段预订航班的对话。", requiredPoints: ["说明目的地", "选择舱位和日期", "记下一项航班信息"] },
  { title: "机场值机", prompt: "请用英语写一段在机场办理值机手续的对话。", requiredPoints: ["询问地点", "出示旅行证件", "选择座位并说明行李"] },
  { title: "行李与登机", prompt: "请用英语写一段托运超重行李并寻找登机口的对话。", requiredPoints: ["说明行李重量", "询问额外费用", "说出登机口号码"] },
  { title: "邮局寄信", prompt: "请用英语写一段在邮局寄信或寄卡片的对话。", requiredPoints: ["说明寄送物品", "说明目的地", "询问邮资"] },
  { title: "看医生", prompt: "请用英语写一段因感冒、发烧或喉咙痛看医生的简短对话。", requiredPoints: ["描述症状", "回答医生的问题", "写出一条建议"] },
  { title: "参观动物园", prompt: "请用英语写一次动物园参观经历，并说明一条动物安全规则。", requiredPoints: ["说出一种动物", "描述动物外观", "写出一条安全或保护规则"] },
  { title: "去看电影", prompt: "请用英语写一段买电影票并评价影片的对话。", requiredPoints: ["选择电影和时间", "处理满座情况", "表达自己的看法"] },
  { title: "求职面试", prompt: "请用英语写出一场简单求职面试中的回答。", requiredPoints: ["说明想得到工作的原因", "说明经验或学习意愿", "询问一个与工作有关的问题"] },
  { title: "紧急求助", prompt: "请用英语写一段发生事故或火灾后的紧急求助电话。", requiredPoints: ["说明紧急情况", "给出准确地点", "清楚描述问题"] },
];

export const DEFAULT_WRITING_TOPICS: WritingTopic[] = GREETINGS_WRITING.map(([, , , minWords, recommendedWords, , vocabularyHints], index) => {
  const task = CHINESE_WRITING_TASKS[index];
  if (!task) throw new Error("写作题目配置不完整。");
  return {
    id: "greetings-writing-" + (index + 1),
    title: task.title,
    prompt: task.prompt,
    minWords,
    recommendedWords,
    requiredPoints: [...task.requiredPoints],
    vocabularyHints: [...vocabularyHints],
  };
});

export function loadWritingTopics() {
  return DEFAULT_WRITING_TOPICS;
}


