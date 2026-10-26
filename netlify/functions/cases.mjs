// Case facts, authored customer lines and case metadata. Server-side only.
// Never import this file from the browser. Only the current visible state leaves the server.

export const CASE_ORDER = ['A', 'B', 'C', 'D'];

export const CASE_META = {
  A: { channel: 'chat', startHeat: 3, topic: 'Delayed delivery' },
  B: { channel: 'email', startHeat: 4, topic: 'Defective item' },
  C: { channel: 'chat', startHeat: 3, topic: 'Duplicate charge' },
  D: { channel: 'email', startHeat: 3, topic: 'Compensation above authority' }
};

// ---------- Fact sets (index 0 = set 1) ----------

export const FACTS = {
  A: [
    { customer: 'Chioma Okafor', item: 'Ankara aso ebi set', orderNo: 'TRV48213', amount: '₦24,500', amountNum: 24500, event: "my sister's naming ceremony on Saturday", ordered: '6 days ago', orderedDays: 6, city: 'Lagos', lastScan: '3 days ago at the Ikeja hub', scanDays: 3, hub: 'Ikeja' },
    { customer: 'Musa Ibrahim', item: 'standing fan', orderNo: 'TRV51907', amount: '₦38,900', amountNum: 38900, event: 'the church program on Sunday', ordered: '7 days ago', orderedDays: 7, city: 'Abuja', lastScan: '4 days ago at the Abuja hub', scanDays: 4, hub: 'Abuja' },
    { customer: 'Ngozi Anyanwu', item: 'school uniform set and shoes', orderNo: 'TRV60377', amount: '₦19,800', amountNum: 19800, event: "my son's resumption on Monday", ordered: '5 days ago', orderedDays: 5, city: 'Port Harcourt', lastScan: '3 days ago at the Port Harcourt hub', scanDays: 3, hub: 'Port Harcourt' }
  ],
  B: [
    { customer: 'Adaobi Nwankwo', item: 'wireless earbuds', orderNo: 'TRV55120', amount: '₦18,500', amountNum: 18500, delivered: '2 days ago', deliveredDays: 2, fault: 'stopped charging after one day' },
    { customer: 'Bashir Aliyu', item: 'electric kettle', orderNo: 'TRV55986', amount: '₦14,200', amountNum: 14200, delivered: '3 days ago', deliveredDays: 3, fault: 'stopped heating on the second day' },
    { customer: 'Folake Ajayi', item: '20,000 mAh power bank', orderNo: 'TRV56740', amount: '₦12,900', amountNum: 12900, delivered: '1 day ago', deliveredDays: 1, fault: 'no longer charges my phone' }
  ],
  C: [
    { customer: 'Kelechi Onuoha', orderNo: 'TRV70125', amount: '₦32,000', amountNum: 32000, chargeMinsBefore: 52 },
    { customer: 'Sadiq Umar', orderNo: 'TRV70488', amount: '₦15,750', amountNum: 15750, chargeMinsBefore: 37 },
    { customer: 'Blessing Edet', orderNo: 'TRV71026', amount: '₦42,300', amountNum: 42300, chargeMinsBefore: 71 }
  ],
  D: [
    // The plan gives no delivery date for Case D; deliveredDays is supplied here (2, 1, 3 days ago).
    { customer: 'Kingsley Ogbu', item: 'A4 laser printer, model P200', itemDelivered: 'an inkjet printer, model J110', price: '₦145,000', priceNum: 145000, job: 'a flyer printing job for a client', demand: '₦250,000', demandNum: 250000, orderNo: 'TRV62011', deliveredDays: 2 },
    { customer: 'Rukayya Sani', item: 'industrial sewing machine', itemDelivered: 'a hand sewing machine', price: '₦98,000', priceNum: 98000, job: 'wedding outfit orders', demand: '₦180,000', demandNum: 180000, orderNo: 'TRV62874', deliveredDays: 1 },
    { customer: 'Mercy Udoh', item: 'ring light with tripod', itemDelivered: 'a phone holder only', price: '₦27,500', priceNum: 27500, job: 'a paid photo shoot', demand: '₦120,000', demandNum: 120000, orderNo: 'TRV63302', deliveredDays: 3 }
  ]
};

// ---------- Subjects (email cases) ----------

export const SUBJECTS = {
  B: { opener: 'Faulty {item}', reply: 'Re: Faulty {item}', chaser1: 'Still no reply' },
  D: { opener: 'Wrong item and my lost job', reply: 'Re: Wrong item and my lost job', chaser1: 'Still no reply' }
};

// ---------- Customer line pack ----------
// Heat banks: heat[level] is an array of variants (a, b). Ids are built as heat<level><a|b>.

export const LINES = {
  A: {
    opener: 'You promised my {item} yesterday. It did not come. I have wasted the whole day waiting. I want my money back.',
    heat: {
      1: ['Okay, thank you. I just want to know what is happening with my order.'],
      2: ['Alright. But I need this for {event}. I need to know what is going on.', 'Okay. I am listening, but nobody told me about the delay.'],
      3: ['I ordered it {ordered}. Why is it still not here?', 'So what is the plan? {event} is not going to move.'],
      4: ['You keep talking but you are not telling me anything. Where is my order?', 'I am tired of this. Every answer sounds the same. Just give me my money.'],
      5: ['This is useless. I am wasting my airtime on you. Refund me now or I will report {brand}.', 'You people are wicked. You take money and give excuses. I want my refund now.']
    },
    rejected: ['Do not give me options. You have not even told me where my order is.', 'I did not ask for that. You have not answered me.'],
    full: 'Okay. {option} by {time}. I will wait for your update. Thank you.',
    grudging: 'Fine. I will wait until {time}. Please do not let me down again.',
    promise: 'Okay, {time} then. I will hold you to that.',
    chasers: ['Hello? Are you still there?', 'I am still waiting. Please reply.'],
    close: 'I have had enough. I am leaving this chat and I will take this up elsewhere.',
    fallback: 'I have already given you what I have. Please check the order.',
    answers: {
      orderNo: 'My order number is {orderNo}.',
      ordered: 'I ordered it {ordered}. It was promised yesterday.',
      payment: 'I paid with my {brand} Wallet. It was {amount}.',
      tracking: 'The tracking has not moved since {lastScan}.',
      outcome: 'I want the item before {event}. If you cannot do that, I want my money back.',
      city: 'I am in {city}.'
    }
  },
  B: {
    opener: 'Good day. I bought {item} for {amount} and it {fault}. I wrote to your chat and the person told me to read your policy. I did not ask for a policy. I asked for help. Please fix this. {name}',
    heat: {
      1: ['Thank you for your reply. I have noted it. Please confirm the next step so I can plan. {name}'],
      2: ['Thank you. I am still unhappy that I had to write twice. What is the next step for my {item}? {name}', 'I have your message. I will wait, but I expect this to be settled properly. {name}'],
      3: ['I am writing again because I still do not know what will happen with my {item}. Please tell me clearly. {name}', 'This is my second message and I still have no clear answer on the {item}. What will you do? {name}'],
      4: ['I am very disappointed. First I was told to read a policy, and now I have a reply that solves nothing. {name}', 'This is poor service. I paid {amount} for a product that does not work and nobody has told me what {brand} will do. {name}'],
      5: ['I am tired of writing. If I do not get a clear answer today, I will post this on social media and ask for my money. {name}', 'This is unacceptable. I want my {amount} back now, and I will tell others how {brand} treats customers. {name}']
    },
    rejected: ['I do not want to read about return rules. My {item} is faulty. It is not a change of mind. {name}', 'You have not answered my question. What will happen to my {item}? {name}'],
    full: 'Thank you. I will send what you asked for and wait for the {option} by {time}. I appreciate it. {name}',
    grudging: 'Okay. I will wait until {time}. I hope this is not another delay. {name}',
    promise: 'Thank you. I will expect the {option} by {time}. {name}',
    chasers: ['Good day. I wrote earlier and I have not heard from you. Please reply today. {name}', 'No answer yet. Please respond. {name}'],
    close: 'I have not received a clear answer. I will take this further. {name}',
    fallback: 'I gave you the details in my first email. Please read it again. {name}',
    answers: {
      orderNo: 'My order number is {orderNo}.',
      evidence: 'I have attached a short video that shows the fault.',
      delivered: 'It was delivered {delivered}.',
      outcome: 'I would like a replacement. If that is not possible, I want a refund.',
      earlierChat: 'The agent only told me to read the returns policy. Nothing else.'
    }
  },
  C: {
    opener: 'I was charged twice for order {orderNo}. {amount} was taken two times. Fix it now.',
    insult2: ['Are you stupid? I said two debits of {amount}. Read what I wrote.', 'You people are useless. Every time something goes wrong, you start asking questions.'],
    relapse4: ['I said fix it. Are you deaf? You are wasting my time.', 'You are incompetent. If this is not fixed I will post your name online and everyone will know how useless you are.'],
    heat: {
      1: ['Okay. I just want the second charge to go back to my wallet.'],
      2: ['Alright, please check it. Both debits are on my statement.', 'Okay. But it is my money and I need it back.'],
      3: ['How hard is it to see two debits? Why am I explaining this?', 'I am not happy. I placed one order and you took money twice.'],
      4: ['I am angry. It is my money and nobody is sorting it out.', 'Every answer you give is the same. Just reverse the charge.'],
      5: ['This is a joke. I will tell everyone how {brand} handles money.', 'I am done with this chat. Reverse my money now.']
    },
    afterBoundary: ['Fine. Just check the transaction.', 'Okay. I am angry because it is my money. Please sort it out.'],
    rejected: ['Do not tell me about processes. Reverse my money.', 'I did not ask for steps. I asked for my money.'],
    full: 'Okay. {option} by {time}. I will check my wallet then. Thank you.',
    grudging: 'Fine. I will check on {time}. Please make sure it happens.',
    transferAccept: "Fine. I will wait for the supervisor's call by {time}. Please make sure my money is sorted.",
    promise: 'Okay, {time}. I will check my wallet then.',
    chasers: ['Hello? Are you there?', 'I am still waiting. Please reply.'],
    close: 'This is not helping. Give me your supervisor.',
    fallback: 'I have told you what I know. Please check the transaction.',
    answers: {
      orderNo: 'My order number is {orderNo}.',
      time: 'It happened at {chargeTime}. Both debits are on my statement.',
      status: 'Both say completed, not pending.',
      payment: 'I paid with my {brand} Wallet card.',
      outcome: 'I want the second {amount} back in my wallet.'
    }
  },
  D: {
    opener: 'Good day. You sent me {itemDelivered} instead of {item}. I needed it for {job} and I lost the job. I want {demand} as compensation. {name}',
    heat: {
      1: ['Thank you for your reply. Please tell me what will happen about my claim. {name}'],
      2: ['I have read your message. I still need to know what {brand} will pay for my loss. {name}', 'Okay. But my loss is real and I expect {brand} to treat it seriously. {name}'],
      3: ['{brand} made the mistake. Why should I carry the loss? {name}', 'I need a straight answer about the {demand}. I do not want to be passed around. {name}'],
      4: ['I lost business because of your error and you are asking me questions. Pay the {demand} or tell me who can decide. {name}', 'Every message you send avoids my claim. I want someone who can decide. {name}'],
      5: ['This is a disgrace. Pay {demand} or I will go to the press and tell everyone what you did to me. {name}', 'You people are useless. I want {demand} today or I will take legal action. {name}']
    },
    rejected: ['A small credit is not what I asked for. I asked about my loss of {demand}. {name}', 'I did not ask for a speech. Who decides on my claim? {name}'],
    full: 'Thank you. I will send my proof and wait for {owner} to review by {time}. {name}',
    grudging: 'Fine. I will wait for the review by {time}. I expect a real answer. {name}',
    promise: 'Thank you. I will expect {demand} by {time}. {name}',
    chasers: ['Good day. I have not heard from you about my claim. Please reply today. {name}', 'No answer yet. Please respond. {name}'],
    close: 'You have not told me who decides. I will take this further. {name}',
    fallback: 'I explained my loss in my first email. Please read it again. {name}',
    answers: {
      proof: "I can send the client's message cancelling the job and my invoice.",
      delivered: 'I received {itemDelivered}. That is not what I ordered.',
      orderNo: 'My order number is {orderNo}.',
      outcome: 'I want {demand}, and I also want the right item.',
      job: 'The job was {job}.'
    }
  }
};

// ---------- Date helpers (all in Africa/Lagos) ----------

const DAY_MS = 86400000;

export function fmtDate(ms, tz) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms));
}
export function fmtTime(ms, tz) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(ms)).replace(' ', '').toLowerCase();
}
// Case C: the double charge happened a set number of minutes before the learner started the shift,
// so the charge time is always in the past and always matches the frozen shift timestamp.
export function chargeTimeText(f, startMs, tz) {
  const at = startMs - f.chargeMinsBefore * 60000;
  const day = fmtDate(at, tz) === fmtDate(startMs, tz) ? 'today' : 'yesterday';
  return `${fmtTime(at, tz)} ${day}`;
}

export function fmtDateTime(ms, tz) {
  return `${fmtDate(ms, tz)}, ${fmtTime(ms, tz)}`;
}

// ---------- Order record shown in the context panel ----------

export function buildRecord(caseId, f, refMs, tz, state = {}) {
  const d = (n) => fmtDate(refMs - n * DAY_MS, tz);
  switch (caseId) {
    case 'A':
      return {
        title: `Order ${f.orderNo}`,
        rows: [
          ['Customer', f.customer],
          ['Delivery city', f.city],
          ['Item', f.item],
          ['Amount', `${f.amount}, paid by {brand} Wallet`],
          ['Ordered', d(f.orderedDays)],
          ['Promised delivery', d(1)],
          ['Tracking status', 'At hub'],
          ['Last scan', `${d(f.scanDays)}, ${f.hub} hub`],
          ['Proof of delivery', 'None']
        ],
        notes: []
      };
    case 'B':
      return {
        title: `Order ${f.orderNo}`,
        rows: [
          ['Customer', f.customer],
          ['Item', f.item],
          ['Amount', f.amount],
          ['Delivered', `${d(f.deliveredDays)} (inside the 7 day window)`],
          ['Fault evidence', state.evidenceReceived ? 'Received: short video' : 'Not received']
        ],
        notes: ['Earlier chat note: "First agent referred customer to the returns policy."']
      };
    case 'C':
      return {
        title: `Order ${f.orderNo}`,
        rows: [
          ['Customer', f.customer],
          ['Orders', '1'],
          ['Debit 1', `${f.amount}, completed, ${f.chargeTime}`],
          ['Debit 2', `${f.amount}, completed, ${f.chargeTime}`],
          ['Paid by', '{brand} Wallet card']
        ],
        notes: []
      };
    case 'D':
      return {
        title: `Order ${f.orderNo}`,
        rows: [
          ['Customer', f.customer],
          ['Item ordered', f.item],
          ['Item delivered', f.itemDelivered],
          ['Amount paid', f.price],
          ['Delivered', d(f.deliveredDays)]
        ],
        notes: []
      };
  }
  return { title: '', rows: [], notes: [] };
}
