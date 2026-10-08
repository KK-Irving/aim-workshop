/* ============================================================
 * 瓦工坊 · 仿「瞄准专家」演示数据
 * 数据结构与内容仿照 ishoutu.cn/aim 页面整理，仅供学习演示
 * ============================================================ */

window.AIM_DATA = {
  maps: [
    { key: "ascent", name: "亚海悬城", isNew: false },
    { key: "split",  name: "霓虹町",   isNew: false },
    { key: "haven",  name: "隐世修所", isNew: false },
    { key: "summit", name: "天枢云阙", isNew: false },
    { key: "lotus",  name: "莲华古城", isNew: true  },
  ],

  /* 还没复刻、暂未开放的地图（切换条右侧竖排锁定项） */
  lockedMaps: ["源工重镇", "森寒冬港", "微风岛屿", "裂变峡谷", "深海明珠", "日落之城", "幽邃地窟", "盐海矿镇"],

  /* 训练项目：42 个（亚海悬城9 / 霓虹町8 / 隐世修所11 / 天枢云阙8 / 莲华古城6）
   * diff: "l1"=简单(1格) "l3"=困难(3格) null=不显示难度条
   * pos:  封面图 object-position，同原站每张卡取景不同
   */
  drills: [
    /* ---------- 亚海悬城 ---------- */
    { map: "ascent", no: "74C0E1", title: "s0pp无甲手枪名场面", type: "名场面", plays: "41.8万", diff: null,  pos: "18% 38%", desc: "s0pp无甲手枪杀四个，结束比赛" },
    { map: "ascent", no: "24B56F", title: "DDY预瞄训练中远上A小", type: "预瞄", plays: "59.5万", diff: "l3", pos: "50% 30%", desc: "Bot会开枪，个人血量有限，难度较难" },
    { map: "ascent", no: "B840A9", title: "DDY预瞄训练中远上A小", type: "预瞄", plays: "9.4万",  diff: "l1", pos: "82% 44%", desc: "线路是中远上A小，Bot不会开枪，作为练习熟悉点位使用" },
    { map: "ascent", no: "87A361", title: "DDY预瞄训练A大进攻路线", type: "预瞄", plays: "27.9万", diff: "l3", pos: "34% 62%", desc: "60秒限时，机器人会开枪，难度较为困难" },
    { map: "ascent", no: "8BC169", title: "DDY预瞄训练A大进攻路线", type: "预瞄", plays: "4.9万",  diff: "l1", pos: "66% 26%", desc: "机器人不会开枪，站的位置和开枪版本一致，作为熟悉点位，练习使用" },
    { map: "ascent", no: "E61B0A", title: "DDY预瞄训练B厅路线", type: "预瞄", plays: "4万",    diff: "l1", pos: "12% 55%", desc: "机器人不会开枪，站的位置和开枪版本一致，作为练习使用" },
    { map: "ascent", no: "391210", title: "DDY预瞄训练B厅路线", type: "预瞄", plays: "19万",   diff: "l3", pos: "90% 34%", desc: "60秒限时，机器人会开枪" },
    { map: "ascent", no: "1A1342", title: "B大进攻路线", type: "预瞄", plays: "21.6万", diff: "l3", pos: "44% 20%", desc: "150血量，30秒限时，机器人会开枪反击" },
    { map: "ascent", no: "1B597B", title: "A2 回防预瞄", type: "预瞄", plays: "5.6万",  diff: "l1", pos: "72% 60%", desc: "纯净预瞄地图" },

    /* ---------- 霓虹町 ---------- */
    { map: "split", no: "CB2431", title: "霓虹厅A大架枪（优化版）", type: "架枪", plays: "8.6万", diff: null, pos: "18% 38%", desc: "架枪和背闪结合的训练" },
    { map: "split", no: "782614", title: "霓虹厅B二楼接包点", type: "架枪", plays: "4万",   diff: "l3", pos: "50% 30%", desc: "模拟二楼平台接包点" },
    { map: "split", no: "0A18B5", title: "DDY预瞄教学A大进攻路线", type: "预瞄", plays: "13.7万", diff: "l3", pos: "82% 44%", desc: "进攻路线与简单一致A大上铁板，BOT会开枪，死亡自动结束。" },
    { map: "split", no: "42892B", title: "DDY预瞄教学A大进攻路线", type: "预瞄", plays: "2.1万",  diff: "l1", pos: "34% 62%", desc: "BOT不会动，路线是从A大上铁板，不需要进包点" },
    { map: "split", no: "A4AE10", title: "DDY预瞄训练B厅进攻", type: "预瞄", plays: "9.4万",  diff: "l3", pos: "66% 26%", desc: "Bot会开枪，线路和BOT摆放与简单版本一致" },
    { map: "split", no: "68251F", title: "DDY预瞄训练B厅进攻", type: "预瞄", plays: "1.3万",  diff: "l1", pos: "12% 55%", desc: "Bot不会开枪，用来熟悉线路和BOT摆放" },
    { map: "split", no: "EA526D", title: "DDY 中路预瞄训练", type: "预瞄", plays: "28.7万", diff: "l3", pos: "90% 34%", desc: "BOT会开枪，死亡会重开，与简单版本路线BOT一致" },
    { map: "split", no: "EC1016", title: "DDY 中路预瞄训练", type: "预瞄", plays: "1.7万",  diff: "l1", pos: "44% 20%", desc: "路线是中路上B2楼，BOT不会开枪" },

    /* ---------- 隐世修所 ---------- */
    { map: "haven", no: "8E3C43", title: "Erv 正义7秒5杀", type: "名场面", plays: "43.6万", diff: null, pos: "18% 38%", desc: "隐士修所C大，Erv 正义7秒5杀，改良版。增加了空气墙" },
    { map: "haven", no: "95DB7D", title: "遗落境地A包接人背闪", type: "背闪", plays: "5.8万", diff: "l1", pos: "50% 30%", desc: "A包点接人，加入背闪" },
    { map: "haven", no: "0D9880", title: "隐士修所DDY预瞄中路进攻车库（随机）", type: "预瞄", plays: "22.2万", diff: "l3", pos: "82% 44%", desc: "人机会开枪，点位固定20个，但是随机出，主意交叉枪线和随机点位" },
    { map: "haven", no: "275F85", title: "隐士修所DDY预瞄中路进攻车库", type: "预瞄", plays: "9101", diff: "l1", pos: "34% 62%", desc: "路线是中路进车库去C包，BOT不开枪，熟悉点位" },
    { map: "haven", no: "03FB06", title: "隐士修所DDY C大进攻路线", type: "预瞄", plays: "6.9万", diff: "l3", pos: "66% 26%", desc: "Bot会开枪，小心交叉枪线，没有随机数值" },
    { map: "haven", no: "6973BD", title: "隐士修所DDY C大进攻路线", type: "预瞄", plays: "6491", diff: "l1", pos: "12% 55%", desc: "Bot不动不开枪，常规预瞄点位" },
    { map: "haven", no: "F4DD44", title: "隐士修所DDY预瞄A小进攻", type: "预瞄", plays: "8万",   diff: "l3", pos: "90% 34%", desc: "只走A小，bot会开枪，没开随机生成" },
    { map: "haven", no: "17B1D2", title: "隐士修所DDY预瞄A小进攻", type: "预瞄", plays: "8078", diff: "l1", pos: "44% 20%", desc: "只走A小，bot不会开枪。基础预瞄" },
    { map: "haven", no: "935EFD", title: "遗落境地DDY A大进攻预瞄（随机）", type: "预瞄", plays: "15.8万", diff: "l3", pos: "72% 60%", desc: "Bot开枪更快，点位不固定，固定15个bot" },
    { map: "haven", no: "AFCBC7", title: "遗落境地DDY A大进攻预瞄（开枪）", type: "预瞄", plays: "8.1万", diff: "l3", pos: "18% 38%", desc: "BOT会开枪，注意拆分枪线。路线和bot摆放与简单一致" },
    { map: "haven", no: "460293", title: "遗落境地DDY A大进攻预瞄", type: "预瞄", plays: "9379", diff: "l1", pos: "50% 30%", desc: "路线是走A大到A包，BOT不开枪，熟悉线路" },

    /* ---------- 天枢云阙 ---------- */
    { map: "summit", no: "5A9E43", title: "Boaster架枪训练（困难）", type: "架枪", plays: "1.5万", diff: null, pos: "18% 38%", desc: "Boaster常练项目 冷静开枪带点小跟枪微调" },
    { map: "summit", no: "29D973", title: "Boaster架枪训练（简单静步）", type: "预瞄", plays: "4101", diff: null, pos: "50% 30%", desc: "Boaster常用项目的简单版，人物为静步时移速，同时距离更近" },
    { map: "summit", no: "FF8153", title: "天枢云阙中路上B", type: "预瞄", plays: "7.5万", diff: "l3", pos: "82% 44%", desc: "除了会动的BOT固定刷新，其余共20个 点位随机生成" },
    { map: "summit", no: "FDB3A7", title: "天枢云阙中路上B", type: "预瞄", plays: "7399", diff: "l1", pos: "34% 62%", desc: "路线从中路到B警家口，BOT全在，无随机值，有一个会动的" },
    { map: "summit", no: "B69DE2", title: "天枢云阙B大进攻（开枪）", type: "预瞄", plays: "4.8万", diff: "l3", pos: "66% 26%", desc: "蹲和移动的BOT开枪会准些，没有随机生成，路线是B大往Bs走" },
    { map: "summit", no: "75551C", title: "天枢云阙B大进攻", type: "预瞄", plays: "5805", diff: "l1", pos: "12% 55%", desc: "进攻路线往B S走，个别BOT会移动" },
    { map: "summit", no: "BA9AF0", title: "天枢云阙A大进攻预瞄", type: "预瞄", plays: "6.4万", diff: "l3", pos: "90% 34%", desc: "Bot会摆射开枪，蹲姿和移动BOT开枪较快。点位随机15，固定3个移动bot共18个" },
    { map: "summit", no: "B212F6", title: "天枢云阙A大进攻预瞄", type: "预瞄", plays: "8819", diff: "l1", pos: "44% 20%", desc: "Bot有会动的，路线是A大一路到包点偏CT前点" },

    /* ---------- 莲华古城 ---------- */
    { map: "lotus", no: "E141B0", title: "莲花古城DDY C大进攻预瞄", type: "预瞄", plays: "4.3万", diff: "l3", pos: "18% 38%", desc: "注意上下枪线和交叉枪线，Bot开枪较准" },
    { map: "lotus", no: "CEA517", title: "莲花古城DDY C大进攻预瞄", type: "预瞄", plays: "4419", diff: "l1", pos: "50% 30%", desc: "熟悉常规预瞄点位，注意角落，BOT不开枪" },
    { map: "lotus", no: "35E58D", title: "莲花古城DDY B进攻预瞄", type: "预瞄", plays: "4.7万", diff: "l3", pos: "82% 44%", desc: "蹲姿bot和摆射Bot开枪较快，位置与简单相同。" },
    { map: "lotus", no: "8493FC", title: "莲花古城DDY B进攻预瞄", type: "预瞄", plays: "3690", diff: "l1", pos: "34% 62%", desc: "Bot较少，但是交叉枪线很多，注意排点。" },
    { map: "lotus", no: "E759F8", title: "莲花古城A大进攻（随机）", type: "预瞄", plays: "11.4万", diff: "l3", pos: "66% 26%", desc: "BOT点位随机可能性生成，开枪较快较准" },
    { map: "lotus", no: "789F9E", title: "莲花古城A大进攻", type: "预瞄", plays: "1.6万", diff: "l1", pos: "12% 55%", desc: "A大进攻，路线是到A包点口，BOT不开枪" },
  ],

  /* 英雄区轮播：顺序同原站（4 秒一换），每帧配对应地图封面大图 + 角色立绘 */
  featured: [
    { map: "summit", no: "5A9E43", agent: "jett"    },
    { map: "ascent", no: "74C0E1", agent: "waylay" },
    { map: "haven",  no: "8E3C43", agent: "killjoy"},
    { map: "ascent", no: "24B56F", agent: "yoru"   },
    { map: "haven",  no: "95DB7D", agent: "reyna"  },
  ],

  /* 底栏官方交流群（同原站弹窗数据） */
  groups: {
    kook:  "www.kookapp.cn/a/…",
    qq: [
      { name: "QQ 3 群", num: "1128432019", full: true  },
      { name: "QQ 2 群", num: "1128166901", full: true  },
      { name: "QQ 1 群", num: "1095542309", full: false },
    ],
  },
};
