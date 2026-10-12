/**
 * The guided walkthrough.
 *
 * Each step says three things, because those are exactly what gets confusing
 * when one person drives an app built for two:
 *
 *   as    — which account you must be signed in as
 *   go    — where to navigate
 *   do    — the one thing to click
 *
 * `asEmail` lets the guide offer a one-tap switch when you are on the wrong
 * account, which is the mistake everyone makes first.
 */
export const DEMO_STEPS = [
  {
    id: 'post',
    title: 'Post a task',
    as: 'Kinza',
    asEmail: 'kinza@madad.local',
    go: 'Post tab (the orange + at the bottom)',
    do: 'Fill in a title and a bounty, then tap "Post task".',
    why: 'Kinza is the Wisher — the person who needs something done.',
    tip: 'Try the microphone button instead: say "pick up my printouts from the library, I will pay 50 rupees" and watch the form fill itself in.',
  },
  {
    id: 'see-live',
    title: 'Watch it appear instantly',
    as: 'Rohan',
    asEmail: 'rohan@madad.local',
    go: 'Feed tab',
    do: 'Just look — the task Kinza posted is already there. No refresh.',
    why: 'This is the WebSocket feed. New tasks push to everyone nearby the moment they are posted.',
    tip: 'You will never see your own tasks here — the server filters them out, because claiming your own task would be pointless.',
  },
  {
    id: 'claim',
    title: 'Claim the task',
    as: 'Rohan',
    asEmail: 'rohan@madad.local',
    go: 'Feed → tap the task Kinza just posted',
    do: 'Tap the orange "Accept for ₹…" button.',
    why: 'The claim is atomic on the server, so two volunteers tapping at the same instant cannot both win.',
    tip: 'It vanishes from everyone else\'s feed the moment you accept.',
  },
  {
    id: 'chat',
    title: 'Coordinate in the private chat',
    as: 'Either account',
    go: 'Open the task → "Chat with …"',
    do: 'Send a message. Switch accounts and reply.',
    why: 'The chat room only exists because a claim created it, and only these two people can join it.',
    tip: 'Switch to the other account and you will see your message already waiting.',
  },
  {
    id: 'code',
    title: 'Show the handshake code',
    as: 'Kinza',
    asEmail: 'kinza@madad.local',
    go: 'Open the claimed task',
    do: 'Read the big 4-digit code on screen. Write it down.',
    why: 'Only the Wisher ever sees this code. It is how the app proves the two people physically met.',
    tip: 'This is the strongest moment in your presentation — a completion cannot be faked from a bedroom.',
  },
  {
    id: 'verify',
    title: 'Enter the code',
    as: 'Rohan',
    asEmail: 'rohan@madad.local',
    go: 'Open the same task',
    do: 'Type the 4 digits into the box and tap "Verify code".',
    why: 'The task moves to "delivered" and payment unlocks.',
    tip: 'Type a wrong code first to show it refuses.',
  },
  {
    id: 'pay',
    title: 'Pay with the UPI QR',
    as: 'Kinza',
    asEmail: 'kinza@madad.local',
    go: 'Open the task',
    do: 'A UPI QR code appears. Scan it with GPay on your real phone — then tap "I have paid".',
    why: 'This is the whole no-gateway argument. The QR is a standard UPI link straight to Rohan\'s bank. The server never touches the money.',
    tip: 'Do NOT complete the payment on your phone — just show that GPay opens with the amount filled in.',
  },
  {
    id: 'confirm',
    title: 'Confirm the money arrived',
    as: 'Rohan',
    asEmail: 'rohan@madad.local',
    go: 'Open the task',
    do: 'Tap "Yes, I received it".',
    why: 'Only now does the task settle and trust scores move. Neither person can close a deal alone — that is what replaces escrow.',
    tip: 'Watch both trust scores change live.',
  },
  {
    id: 'rate',
    title: 'Leave a rating',
    as: 'Either account',
    go: 'The settled task',
    do: 'Tap "Rate …" and give some stars.',
    why: '4–5 stars adds trust points, 1–2 removes them. Ratings feed straight back into the score.',
  },
  {
    id: 'restricted',
    title: 'See the trust system bite',
    as: 'Deepak',
    asEmail: 'deepak@madad.local',
    go: 'Post tab',
    do: 'Try to post a task. It refuses.',
    why: 'Deepak has a trust score of 28. Below 40 the account is automatically restricted — he flaked on tasks and failed to pay.',
    tip: 'This is your answer to "what stops someone not paying?"',
  },
  {
    id: 'admin',
    title: 'Open the admin dashboard',
    as: 'Admin',
    asEmail: 'admin@madad.local',
    go: 'Profile → Admin dashboard',
    do: 'Look at the stats, then open the Disputes tab.',
    why: 'There is an open dispute with the chat history kept as evidence — which is why chat is hidden at settlement rather than deleted.',
  },
  {
    id: 'offline',
    title: 'Try it offline',
    as: 'Any account',
    go: 'Turn off your wifi, then open the Post tab',
    do: 'Create a task while offline, then turn wifi back on.',
    why: 'The task is queued in your browser and posts itself the moment you reconnect.',
    tip: 'A dark "Offline" bar appears at the top, and the queued task shows with a dashed border under My Tasks.',
  },
];

export const TOTAL_STEPS = DEMO_STEPS.length;
