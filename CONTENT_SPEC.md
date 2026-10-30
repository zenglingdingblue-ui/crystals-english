# Crystal's English — 词库内容规范（给所有写内容的人）

## 用户是谁
Crystal，联想（Lenovo）Director，负责国际采购（偏软件 / AI / Cloud 采购），英文已经很好，下属里有美国人。
常去北卡 Morrisville（联想美国总部，RTP 三角区）、硅谷、西雅图（微软等）。
她**不需要**生僻词，需要的是：美国同事嘴里高频出现、但中国人容易"听懂字面、没 get 到深意"的表达，
以及 AI / Cloud 采购领域的新潮词。重点是 **语境 + 潜台词 + 怎么用得更好**。

## 文风
- 中文解释像一位懂行的双语同事在旁边点拨，不要教科书味、不要翻译腔。
- 英文例句必须是她真实会遇到的场景：和 Microsoft / NVIDIA / AWS / SAP / ServiceNow 等供应商谈判，
  和 Legal / Security / Finance / IT 协作，Q4、FY、renewal、RFP、SOW、budget、headcount……
- 例句长度 15–30 词，像真人写的，不要"教材句"。
- 每个词都要有 nuance（潜台词 / 隐含深意）—— 这是整个 App 最有价值的字段，要写到位（2–4 句）。
- 每个词都有 `image`：一句"画面感"描述，帮助记忆的视觉联想（中文，1 句）。

## 文件格式
每个词库一个文件：`data/deck-<key>.js`，内容：

```js
window.CE_DECKS = window.CE_DECKS || [];
window.CE_DECKS.push({
  key: "meeting",                 // 唯一英文 key
  title: "会议里的 Native 动词",   // 中文标题
  subtitle: "Meeting Verbs",      // 英文副标题
  emoji: "🎼",
  color: "#7C5CFF",               // 词库主题色（用于封面渐变）
  intro: "一句话说明这个词库练什么、为什么对 Crystal 重要。",
  words: [ /* 见下 */ ]
});
```

## 单词对象字段（必填除非标注可选）
```js
{
  id: "orchestrate",              // 小写、全局唯一；短语用连字符，如 "circle-back"
  word: "orchestrate",            // 展示用原形
  pos: "v.",                      // v. / n. / adj. / adv. / phr. / idiom / abbr.
  ipa: "/ˈɔːrkɪstreɪt/",          // 美式音标；短语可给主要词的音标或 ""
  emoji: "🎼",                    // 一个 emoji 作视觉标签
  level: 2,                       // 1=基本都会但用不好  2=听得懂说不出  3=新词/不熟
  scene: ["meeting", "email"],    // 从这些里选 1–3 个: meeting, email, negotiation, travel, smalltalk, ai, cloud, leadership
  image: "指挥家站在乐团前挥棒，把几十个乐手拉进同一个节拍——自己不演奏，却让所有人同时发力。",
  gist: "统筹、编排多方协作（强调整体设计和时机）",   // 一句话中文释义，≤ 25 字
  nuance: "美国同事说 orchestrate 时……（2–4 句：隐含深意、褒贬、什么场合、谁对谁说）",
  usage: "怎么用得更 native：搭配、句型、与近义词区别（2–4 句）",
  email: "Jen, could you orchestrate the vendor onboarding across Legal, Security and Finance so we can go live by the 15th?",
  emailZh: "Jen，你能不能统筹一下 Legal、Security 和 Finance 三边的供应商入驻流程，让我们 15 号能上线？",
  meeting: "We need one person to orchestrate the whole rollout, not just own a piece of it.",
  meetingZh: "我们需要一个人来统筹整个上线，而不是各管一段。",
  upgrade: {                      // 可选：从"够用的说法"升级到"更 native 的说法"
    from: "manage / coordinate",
    to: "orchestrate",
    why: "coordinate 只是对齐时间表；orchestrate 暗示你在设计整体节奏，听起来更有掌控力、更 senior。"
  },
  collocations: ["orchestrate a rollout", "orchestrate the response", "a well-orchestrated launch"],
  related: ["coordinate", "choreograph", "align"],
  watchOut: "描述别人时小心：orchestrate a cover-up / a campaign against 带贬义，暗示幕后操纵。"  // 可选
}
```

## 质量要求
- 每个词库 25–35 个词，先列高频再列进阶；**宁缺毋滥**，每条都要写完整。
- `email` 与 `meeting` 两个例句必须**不同场景、不同句型**；邮件句偏书面礼貌，会议句偏口语。
- 对缩写（RFP、SOW、TCO…）`word` 写缩写，`gist` 里写全称。
- 对短语（circle back, double-click on）`pos` 写 "phr."。
- 所有字符串用双引号，内部引号用单引号或转义；文件必须能被 node 直接执行。
- 写完后运行校验：`node validate.js data/deck-<key>.js`。
