// Reference material shown to every learner: policy, staff, previous-shift history, note template.

export const POLICY = [
  { title: 'Late orders', text: 'The agent can raise a delivery trace. Logistics responds within 24 hours. If Logistics cannot confirm a delivery date, the customer may cancel for a full refund to the {brand} Wallet within 3 working days. The agent cannot promise a delivery date.' },
  { title: 'Faulty items', text: 'The customer supplies one photo or short video of the fault. An item can be replaced or refunded within 7 days of delivery. An approved replacement ships within 2 working days; a refund is paid within 3 working days. Change-of-mind rules do not apply to a fault.' },
  { title: 'Duplicate charges', text: 'Payments confirms within 1 working day. The reversal follows within 3 working days of confirmation.' },
  { title: 'Wrong item', text: 'The item is collected and replaced within 2 working days, or refunded.' },
  { title: 'Goodwill credit', text: 'The agent may give up to ₦5,000 to the wallet. Larger claims and claims for business loss go to the Claims reviewer, who responds within 2 working days. Approval is never promised.' },
  { title: 'Payment security', text: 'Never ask for card numbers, PINs or one-time passcodes.' },
  { title: 'Insults', text: 'State one boundary that names the behaviour and the condition for continuing. If insults continue after that, pause and transfer the chat to the shift supervisor. Record the exact words and give the customer the next step and time before transferring.' },
  { title: 'Promises', text: 'Promise only times the agent can meet.' }
];

export const STAFF = [
  { name: 'Folasade Nwosu', role: 'Chief executive officer' },
  { name: 'Emeka Garba', role: 'Chief operating officer' },
  { name: 'Hauwa Lawal', role: 'Head of customer experience' },
  { name: 'Segun Bakare', role: 'Shift supervisor' },
  { name: 'Amaka Eze', role: 'Payments lead' },
  { name: 'Ibrahim Yusuf', role: 'Logistics lead' },
  { name: 'Titilayo Ogunleye', role: 'Claims reviewer' },
  { name: 'Chuka Obi', role: 'Quality and training lead' }
];

// Six read-only conversations. dayOffset is relative to the frozen shift date.
export const HISTORY = [
  { id: 'H1', subject: 'Order status', channel: 'chat', dayOffset: -1, time: '4:42pm', customer: 'Tunde Alabi',
    closure: 'Order located. Customer told delivery was out for dispatch.',
    messages: [
      ['customer', 'Hello. Please where is my order TRV44102?'],
      ['agent', 'Good afternoon Tunde. I can see order TRV44102 is out for delivery today. The rider will call you.'],
      ['customer', 'Okay, thank you.']
    ] },
  { id: 'H2', subject: 'Change delivery address', channel: 'email', dayOffset: -1, time: '3:15pm', customer: 'Ifeoma Chukwu',
    closure: 'Address updated before dispatch. Customer confirmed.',
    messages: [
      ['customer', 'Good day. I need to change the delivery address on my order to 14 Adeola Odeku Street, Victoria Island.'],
      ['agent', 'Good day Ifeoma. The order has not been dispatched, so I have updated the address to 14 Adeola Odeku Street, Victoria Island. You will see the change on your order page.'],
      ['customer', 'Thank you. I can see it.']
    ] },
  { id: 'H3', subject: 'Invoice request', channel: 'email', dayOffset: -1, time: '1:50pm', customer: 'Hadiza Musa',
    closure: 'Invoice sent to the email on file.',
    messages: [
      ['customer', 'Please send me an invoice for my last order. I need it for my office.'],
      ['agent', 'Hello Hadiza. I have sent the invoice for your last order to the email address on your account. It should arrive within a few minutes.'],
      ['customer', 'Received. Thanks.']
    ] },
  { id: 'H4', subject: 'Wallet top up', channel: 'chat', dayOffset: -1, time: '11:08am', customer: 'Obinna Eze',
    closure: 'Top up confirmed in wallet after bank delay.',
    messages: [
      ['customer', 'I topped up my wallet and it has not reflected.'],
      ['agent', 'Hello Obinna. I can see the top up from your bank is now confirmed. Your wallet balance has been updated.'],
      ['customer', 'Yes I can see it now. Thank you.']
    ] },
  { id: 'H5', subject: 'Return label', channel: 'email', dayOffset: -2, time: '5:20pm', customer: 'Janet Bassey',
    closure: 'Return label emailed. Pickup booked.',
    messages: [
      ['customer', 'Good evening. I want to return my trousers because the size is wrong. Please send the return label.'],
      ['agent', 'Good evening Janet. I have emailed your return label. Please attach it to the parcel and the courier will collect it on the date shown in the email.'],
      ['customer', 'Okay, noted.']
    ] },
  { id: 'H6', subject: 'Size exchange', channel: 'chat', dayOffset: -2, time: '2:34pm', customer: 'Ahmed Lawal',
    closure: 'Exchange for the next size up requested. Confirmation sent.',
    messages: [
      ['customer', 'The shirt I received is too small. Can I exchange it for a large?'],
      ['agent', 'Hello Ahmed. Yes, I have raised an exchange for a large. You will get a confirmation by email.'],
      ['customer', 'Fine, thank you.']
    ] }
];

export const NOTE_FIELDS = [
  { n: 1, label: 'Issue' },
  { n: 2, label: 'Key facts' },
  { n: 3, label: 'Verification' },
  { n: 4, label: 'Action' },
  { n: 5, label: 'Outcome' },
  { n: 6, label: 'Next step' },
  { n: 7, label: 'Owner and date' },
  { n: 8, label: 'Conduct or escalation' }
];
