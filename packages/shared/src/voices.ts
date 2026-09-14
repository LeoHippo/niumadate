import type { RoleCopies, RoleKey } from './types';

/**
 * 语气预设：男生版 / 女生版。
 *
 * 同一件事，男生和女生说出来的味儿确实不一样，所以每个身份给两套现成的，
 * 后台点一下就能整套换掉，换完还能自己微调。
 *
 * 写的时候守住两条：
 * 1. **别腻**。「宝宝要睡觉觉的嘛～」这种过头了，可爱不等于叠字多。
 * 2. **保住身份的人设**。DAD&MUM 两版都还是公文腔，只是父亲版更短更硬、母亲版多两句关切。
 */
export const VOICE_KEYS = ['male', 'female'] as const;
export type VoiceKey = (typeof VOICE_KEYS)[number];

export const VOICE_LABELS: Record<VoiceKey, string> = {
  male: '男生版',
  female: '女生版',
};

/** 每个身份出厂默认用哪一版。 */
export const DEFAULT_VOICE: Record<RoleKey, VoiceKey> = {
  brother: 'male',
  sister: 'female',
  baby: 'female',
  dadmam: 'male',
};

/** 出厂默认文案：按 DEFAULT_VOICE 取那个身份该用的那版。 */
export function defaultCopies(roleKey: RoleKey): RoleCopies {
  return VOICE_PRESETS[roleKey][DEFAULT_VOICE[roleKey]];
}

export const VOICE_PRESETS: Record<RoleKey, Record<VoiceKey, RoleCopies>> = {
  // ---------------- 好兄弟 ----------------
  brother: {
    male: {
      morning: '{name}，别逗了，早上我起不来。真要约早上，你先陪我聊个通宵。',
      hotCopy: '中午这太阳，牛马快晒成牛肉干了……',
      coldCopy: '晚上冷得要命，牛马冻成冰鲜了……',
      locked: '这会儿牛马在搬砖，门焊死了。',
      displayOnly: '这个时段就摆着看看，牛马起不来。',
      pending: '牛马在审，别急。',
      pendingSub: '审完就来找你。',
      accepted: '成了，就那天。',
      acceptedSub: '到时候见，别放我鸽子。',
      rejected: '兄弟对不住，这阵子真抽不开身。忙完这阵我请你。',
      closedTitle: '审批不通过',
    },
    female: {
      morning: '{name}，早上真起不来，别为难我了。非约不可的话，前一晚先陪我熬个夜。',
      hotCopy: '中午晒得人发昏，牛马快化了……',
      coldCopy: '晚上冷得直哆嗦，牛马冻僵了……',
      locked: '这个点还在上班，实在走不开。',
      displayOnly: '这个时段就是摆着看看的，真起不来。',
      pending: '在看啦，别催。',
      pendingSub: '看完就回你。',
      accepted: '行，就这么定了。',
      acceptedSub: '到时候见，别迟到。',
      rejected: '真不好意思，这阵子太忙了。忙完请你吃饭。',
      closedTitle: '审批不通过',
    },
  },

  // ---------------- 好姐妹 ----------------
  sister: {
    female: {
      morning: '{name}～早上真的起不来呀，妆都还没化呢。真想约早上，前一晚陪我聊到通宵好不好？',
      hotCopy: '中午太阳好晒，妆都要花了……',
      coldCopy: '晚上好冷，手脚都冰冰的……',
      locked: '这个点还在上班呢，实在抽不开身。',
      displayOnly: '这个时段只是放出来看看的，我起不来啦。',
      pending: '我看看哦，稍等我一下～',
      pendingSub: '很快就给你答复。',
      accepted: '好呀，那就这么定啦！',
      acceptedSub: '到时候见，不许迟到哦。',
      rejected: '真的对不起呀，这阵子太忙了。等我忙完，请你吃好吃的。',
      closedTitle: '审批不通过',
    },
    male: {
      morning: '{name}，早上确实起不来，有点不好意思。真要约早上，前一晚先陪我说说话？',
      hotCopy: '中午太晒了，妆都要花了……',
      coldCopy: '晚上风好大，冷……',
      locked: '这会儿还在忙，出不来。',
      displayOnly: '这个时段只是看看的，起不来。',
      pending: '我看看哈，稍等。',
      pendingSub: '很快给你答复。',
      accepted: '好呀，那就这么定啦。',
      acceptedSub: '到时候见，不见不散。',
      rejected: '真的抱歉，这阵子事情太多了。忙完请你。',
      closedTitle: '审批不通过',
    },
  },

  // ---------------- 好宝宝 ----------------
  // 这一版刻意「降温」：可爱但不腻，不用叠字堆
  baby: {
    female: {
      morning: '早上起不来呀，想睡到自然醒。真要约早上，前一晚陪我聊天好不好？',
      hotCopy: '中午好晒，快化了……',
      coldCopy: '晚上好冷，缩成一团……',
      locked: '这个点在上班，出不来。',
      displayOnly: '这个时段只是摆着看看的，起不来。',
      pending: '在看啦，稍等一下。',
      pendingSub: '很快回你。',
      accepted: '好呀，那就定啦！',
      acceptedSub: '到时候见，要抱抱。',
      rejected: '抱歉呀，这阵子实在忙。忙完补给你。',
      closedTitle: '审批不通过',
    },
    male: {
      morning: '早上？起不来。真要约早上，前一晚陪我通宵。',
      hotCopy: '中午晒得不行，快烤熟了……',
      coldCopy: '晚上冷，冻手冻脚……',
      locked: '这个点在上课，出不来。',
      displayOnly: '这个时段就是看看的，起不来。',
      pending: '在看，等会儿。',
      pendingSub: '看完回你。',
      accepted: '行，就那天！',
      acceptedSub: '到时候见，别放鸽子。',
      rejected: '不好意思啊，这阵子忙。忙完再说。',
      closedTitle: '审批不通过',
    },
  },

  // ---------------- DAD&MUM ----------------
  // 两版都保持公文腔，只是父亲版更短更硬、母亲版多两句关切
  dadmam: {
    male: {
      morning: '早间时段本人实在难以起身，恕难从命。如确需安排于清晨，烦请前一晚先行告知。',
      hotCopy: '午间日光强烈，恐有中暑之虞。',
      coldCopy: '入夜气温骤降，恐受风寒。',
      locked: '此时段本人正在岗，恕难应约。',
      displayOnly: '此时段仅供参阅，本人无法起身，敬请谅解。',
      pending: '申请已收悉，正在审阅。',
      pendingSub: '审阅完毕后将及时答复。',
      accepted: '准。',
      acceptedSub: '届时准时赴约，绝不迟误。',
      rejected: '非常抱歉，近期公务繁忙，实难抽身。待事毕，必当设宴赔罪。',
      closedTitle: '审批不通过',
    },
    female: {
      morning: '早间时分本人实在难以起身，还望体谅。若确需安排于清晨，烦请前一晚先告知一声。',
      hotCopy: '午间日头毒，记得避一避。',
      coldCopy: '入夜转凉，务必添衣。',
      locked: '此时段本人正在岗，恕难应约。',
      displayOnly: '此时段仅供参阅，本人无法起身，还望见谅。',
      pending: '申请已收悉，正在审阅中。',
      pendingSub: '审阅完毕后即予答复。',
      accepted: '准了。',
      acceptedSub: '届时准时赴约，路上当心。',
      rejected: '实在抱歉，近期公务繁忙难以抽身。待事毕，定当设宴赔罪。',
      closedTitle: '审批不通过',
    },
  },
};
