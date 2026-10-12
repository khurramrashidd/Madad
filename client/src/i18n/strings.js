/**
 * Three languages, because the target user is not reliably comfortable in any
 * one of them.
 *
 *   en       — English
 *   hi       — Hindi in Devanagari
 *   hinglish — Hindi grammar in Latin script
 *
 * Hinglish is not a joke entry. A great many Indian users speak Hindi but read
 * Latin script far faster than Devanagari, because that is what they type in.
 * Offering only en/hi pushes exactly those people to English they half-follow.
 *
 * Only durable UI chrome is translated — navigation, actions, states, safety
 * copy. User-generated content (task titles, chat) is never touched, and
 * neither are the honest-limitation notices, which are deliberately precise.
 *
 * Missing keys fall through to English rather than rendering a raw key, so a
 * half-finished translation degrades into mixed language instead of garbage.
 */

export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'hinglish', label: 'Hinglish', native: 'Hinglish' },
];

const en = {
  // ---- Greetings (the header) ----
  'greeting.morning': 'Good morning',
  'greeting.afternoon': 'Good afternoon',
  'greeting.evening': 'Good evening',
  'greeting.night': 'Good evening',

  // ---- Navigation ----
  'nav.feed': 'Feed',
  'nav.tasks': 'Tasks',
  'nav.post': 'Post',
  'nav.chats': 'Chats',
  'nav.profile': 'Profile',
  'nav.menu': 'Menu',
  'nav.leaderboard': 'Leaderboard',
  'nav.notifications': 'Notifications',
  'nav.reviews': 'My reviews',
  'nav.earnings': 'Earnings & spending',
  'nav.savedPlaces': 'Saved places',
  'nav.safety': 'Safety',
  'nav.help': 'How Madad works',
  'nav.settings': 'Settings',
  'nav.admin': 'Admin dashboard',
  'nav.logout': 'Log out',
  'nav.language': 'Language',
  'nav.theme': 'Appearance',

  // ---- Theme ----
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',

  // ---- Feed ----
  'feed.nearYou': 'Tasks near you',
  'feed.findingYou': 'Finding you…',
  'feed.search': 'Search tasks…',
  'feed.filters': 'Filters',
  'feed.distance': 'Distance',
  'feed.sortBy': 'Sort by',
  'feed.closest': 'Closest',
  'feed.highestBounty': 'Highest ₹',
  'feed.newest': 'Newest',
  'feed.reset': 'Reset',
  'feed.showResults': 'Show results',
  'feed.refresh': 'Refresh',
  'feed.nothingNearby': 'Nothing nearby yet',
  'feed.nothingNearbyBody':
    'Be the first to post. Someone close by will pick it up — usually within minutes.',
  'feed.noMatches': 'No matching tasks',
  'feed.noMatchesBody': 'Try clearing your filters or widening the distance.',
  'feed.postTask': 'Post a task',
  'feed.widenSearch': 'Widen the search',
  'feed.expiryNote': 'Open tasks expire automatically if nobody claims them.',
  'feed.live': 'Live',
  'feed.cached': 'Showing your last saved feed. These tasks may already be claimed.',

  // ---- Location ----
  'location.enable': 'Turn on location',
  'location.enableBody':
    'Madad shows tasks around you, so it needs your location. Turn it on, then try again.',
  'location.enableButton': 'Enable location',
  'location.tryAgain': 'Try again',
  'location.setManually': 'Set my area manually',
  'location.approximate': 'Approximate area',
  'location.approximateHint': 'Turn on GPS for exact distances',
  'location.manual': 'Area set by you',
  'location.useMyLocation': 'Use my real location',
  'location.pickTitle': 'Set your area',
  'location.pickBody':
    'Type the name of your area, town or a nearby landmark. You can switch back to GPS any time.',
  'location.pickPlaceholder': 'e.g. Kharghar, Panvel',
  'location.searching': 'Searching…',
  'location.noResults': 'No place found by that name. Try a bigger nearby town.',
  'location.useThis': 'Use this area',

  // ---- Weather ----
  'weather.unavailable': 'Weather unavailable',

  // ---- Tasks ----
  'task.bounty': 'Bounty',
  'task.claim': 'Accept this task',
  'task.away': 'away',
  'task.expiresIn': 'Expires in {n} min',
  'task.postedBy': 'Posted by',

  // ---- Safety ----
  'safety.title': 'Safety',
  'safety.sos': 'SOS',
  'safety.sosTitle': 'Raise a safety alert',
  'safety.sosBody':
    'This tells the other person you have flagged a problem, alerts the Madad team, and offers to call your emergency contact. For a real emergency, call 112.',
  'safety.sosConfirm': 'Raise the alert',
  'safety.sosRaised': 'Alert raised',
  'safety.call112': 'Call 112 (emergency)',
  'safety.callContact': 'Call {name}',
  'safety.shareTrip': 'Share my trip',
  'safety.shareTripBody':
    'Creates a link showing your live position and where you are heading. Send it to someone you trust. It stops working after 6 hours.',
  'safety.copyLink': 'Copy link',
  'safety.linkCopied': 'Link copied — send it to someone you trust',
  'safety.endTrip': 'Stop sharing',
  'safety.trustedContact': 'Emergency contact',
  'safety.trustedContactHint':
    'Only you can see this. Madad never shares it with the other person.',
  'safety.checklist': 'Before you meet',
  'safety.checklistItems': [
    'Meet in a public, busy place where you can be seen.',
    'Tell someone where you are going, or share your trip.',
    'Keep the conversation in the app until you meet.',
    'If something feels wrong, leave. No bounty is worth it.',
  ],

  // ---- Profile ----
  'profile.verification': 'Account checks',
  'profile.photo': 'Photo',
  'profile.changePhoto': 'Change photo',
  'profile.removePhoto': 'Remove photo',
  'profile.completionRate': 'Completion rate',
  'profile.totalEarned': 'Earned',
  'profile.totalSpent': 'Spent',
  'profile.tasksDone': 'Tasks done',
  'profile.tasksPosted': 'Tasks posted',
  'profile.memberSince': 'Member since',
  'profile.notVerifiedNote':
    'Madad does not verify identity. These are activity checks, not proof of who someone is.',

  // ---- Notifications ----
  'push.enable': 'Turn on notifications',
  'push.enabled': 'Notifications are on',
  'push.body': 'Get told when a task appears nearby, someone claims yours, or a payment is confirmed.',
  'push.blocked': 'Notifications are blocked in your browser settings.',

  // ---- Generic ----
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.done': 'Done',
  'common.retry': 'Retry',
  'common.loading': 'Loading…',
  'common.offline': 'Offline — showing your last saved feed.',
  'common.syncing': 'Syncing…',
};

const hi = {
  'greeting.morning': 'सुप्रभात',
  'greeting.afternoon': 'नमस्कार',
  'greeting.evening': 'शुभ संध्या',
  'greeting.night': 'शुभ संध्या',

  'nav.feed': 'फ़ीड',
  'nav.tasks': 'काम',
  'nav.post': 'पोस्ट',
  'nav.chats': 'चैट',
  'nav.profile': 'प्रोफ़ाइल',
  'nav.menu': 'मेनू',
  'nav.leaderboard': 'लीडरबोर्ड',
  'nav.notifications': 'सूचनाएँ',
  'nav.reviews': 'मेरी समीक्षाएँ',
  'nav.earnings': 'कमाई और खर्च',
  'nav.savedPlaces': 'सहेजे गए स्थान',
  'nav.safety': 'सुरक्षा',
  'nav.help': 'मदद कैसे काम करता है',
  'nav.settings': 'सेटिंग्स',
  'nav.admin': 'एडमिन डैशबोर्ड',
  'nav.logout': 'लॉग आउट',
  'nav.language': 'भाषा',
  'nav.theme': 'दिखावट',

  'theme.light': 'उजला',
  'theme.dark': 'गहरा',
  'theme.system': 'सिस्टम',

  'feed.nearYou': 'आपके आसपास के काम',
  'feed.findingYou': 'आपको ढूँढ रहे हैं…',
  'feed.search': 'काम खोजें…',
  'feed.filters': 'फ़िल्टर',
  'feed.distance': 'दूरी',
  'feed.sortBy': 'इसके अनुसार लगाएँ',
  'feed.closest': 'सबसे नज़दीक',
  'feed.highestBounty': 'सबसे ज़्यादा ₹',
  'feed.newest': 'सबसे नया',
  'feed.reset': 'रीसेट',
  'feed.showResults': 'नतीजे दिखाएँ',
  'feed.refresh': 'ताज़ा करें',
  'feed.nothingNearby': 'अभी आसपास कुछ नहीं',
  'feed.nothingNearbyBody':
    'पहला काम आप पोस्ट करें। आसपास कोई न कोई उठा लेगा — आम तौर पर कुछ ही मिनटों में।',
  'feed.noMatches': 'कोई काम नहीं मिला',
  'feed.noMatchesBody': 'फ़िल्टर हटाकर देखें या दूरी बढ़ाएँ।',
  'feed.postTask': 'काम पोस्ट करें',
  'feed.widenSearch': 'दूरी बढ़ाएँ',
  'feed.expiryNote': 'जो काम कोई नहीं लेता, वह अपने आप हट जाता है।',
  'feed.live': 'लाइव',
  'feed.cached': 'आपकी पिछली सहेजी फ़ीड दिख रही है। ये काम पहले लिए जा चुके हो सकते हैं।',

  'location.enable': 'लोकेशन चालू करें',
  'location.enableBody':
    'मदद आपके आसपास के काम दिखाता है, इसलिए लोकेशन ज़रूरी है। चालू करके फिर कोशिश करें।',
  'location.enableButton': 'लोकेशन चालू करें',
  'location.tryAgain': 'फिर कोशिश करें',
  'location.setManually': 'अपना इलाका खुद चुनें',
  'location.approximate': 'अनुमानित इलाका',
  'location.approximateHint': 'सही दूरी के लिए GPS चालू करें',
  'location.manual': 'आपका चुना इलाका',
  'location.useMyLocation': 'मेरी असली लोकेशन लें',
  'location.pickTitle': 'अपना इलाका चुनें',
  'location.pickBody':
    'अपने इलाके, शहर या किसी नज़दीकी निशानी का नाम लिखें। आप कभी भी GPS पर लौट सकते हैं।',
  'location.pickPlaceholder': 'जैसे खारघर, पनवेल',
  'location.searching': 'खोज रहे हैं…',
  'location.noResults': 'इस नाम से कोई जगह नहीं मिली। कोई बड़ा नज़दीकी शहर लिखें।',
  'location.useThis': 'यही इलाका चुनें',

  'weather.unavailable': 'मौसम की जानकारी नहीं',

  'task.bounty': 'इनाम',
  'task.claim': 'यह काम लें',
  'task.away': 'दूर',
  'task.expiresIn': '{n} मिनट में खत्म',
  'task.postedBy': 'पोस्ट किया',

  'safety.title': 'सुरक्षा',
  'safety.sos': 'SOS',
  'safety.sosTitle': 'सुरक्षा अलर्ट भेजें',
  'safety.sosBody':
    'इससे सामने वाले को पता चलेगा कि आपने दिक्कत बताई है, मदद टीम को खबर जाएगी, और आपके आपातकालीन नंबर पर कॉल करने का विकल्प मिलेगा। असली आपात स्थिति में 112 पर कॉल करें।',
  'safety.sosConfirm': 'अलर्ट भेजें',
  'safety.sosRaised': 'अलर्ट भेज दिया',
  'safety.call112': '112 पर कॉल करें (आपातकाल)',
  'safety.callContact': '{name} को कॉल करें',
  'safety.shareTrip': 'मेरा सफ़र साझा करें',
  'safety.shareTripBody':
    'एक लिंक बनेगा जिसमें आपकी लाइव जगह और मंज़िल दिखेगी। किसी भरोसेमंद को भेजें। 6 घंटे बाद लिंक बंद हो जाएगा।',
  'safety.copyLink': 'लिंक कॉपी करें',
  'safety.linkCopied': 'लिंक कॉपी हो गया — किसी भरोसेमंद को भेजें',
  'safety.endTrip': 'साझा करना बंद करें',
  'safety.trustedContact': 'आपातकालीन संपर्क',
  'safety.trustedContactHint': 'यह सिर्फ़ आपको दिखता है। मदद इसे सामने वाले को कभी नहीं बताता।',
  'safety.checklist': 'मिलने से पहले',
  'safety.checklistItems': [
    'किसी खुली, भीड़भाड़ वाली जगह मिलें जहाँ लोग देख सकें।',
    'किसी को बताएँ कि आप कहाँ जा रहे हैं, या अपना सफ़र साझा करें।',
    'मिलने तक बातचीत ऐप में ही रखें।',
    'कुछ ठीक न लगे तो चले जाएँ। कोई इनाम इससे बड़ा नहीं।',
  ],

  'profile.verification': 'खाते की जाँच',
  'profile.photo': 'फ़ोटो',
  'profile.changePhoto': 'फ़ोटो बदलें',
  'profile.removePhoto': 'फ़ोटो हटाएँ',
  'profile.completionRate': 'पूरा करने की दर',
  'profile.totalEarned': 'कमाया',
  'profile.totalSpent': 'खर्च',
  'profile.tasksDone': 'पूरे किए काम',
  'profile.tasksPosted': 'पोस्ट किए काम',
  'profile.memberSince': 'सदस्य बने',
  'profile.notVerifiedNote':
    'मदद पहचान की पुष्टि नहीं करता। ये गतिविधि की जाँच हैं, किसी की पहचान का सबूत नहीं।',

  'push.enable': 'सूचनाएँ चालू करें',
  'push.enabled': 'सूचनाएँ चालू हैं',
  'push.body': 'आसपास नया काम आने, आपका काम लिए जाने, या भुगतान पक्का होने पर खबर पाएँ।',
  'push.blocked': 'आपके ब्राउज़र में सूचनाएँ बंद हैं।',

  'common.save': 'सहेजें',
  'common.cancel': 'रद्द करें',
  'common.close': 'बंद करें',
  'common.done': 'हो गया',
  'common.retry': 'फिर कोशिश करें',
  'common.loading': 'लोड हो रहा है…',
  'common.offline': 'ऑफ़लाइन — आपकी पिछली सहेजी फ़ीड दिख रही है।',
  'common.syncing': 'सिंक हो रहा है…',
};

const hinglish = {
  'greeting.morning': 'Good morning',
  'greeting.afternoon': 'Good afternoon',
  'greeting.evening': 'Good evening',
  'greeting.night': 'Good evening',

  'nav.feed': 'Feed',
  'nav.tasks': 'Mere kaam',
  'nav.post': 'Post',
  'nav.chats': 'Chat',
  'nav.profile': 'Profile',
  'nav.menu': 'Menu',
  'nav.leaderboard': 'Leaderboard',
  'nav.notifications': 'Notifications',
  'nav.reviews': 'Meri reviews',
  'nav.earnings': 'Kamai aur kharch',
  'nav.savedPlaces': 'Saved jagah',
  'nav.safety': 'Safety',
  'nav.help': 'Madad kaise kaam karta hai',
  'nav.settings': 'Settings',
  'nav.admin': 'Admin dashboard',
  'nav.logout': 'Log out',
  'nav.language': 'Bhasha',
  'nav.theme': 'Look',

  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',

  'feed.nearYou': 'Aapke paas ke kaam',
  'feed.findingYou': 'Aapko dhoond rahe hain…',
  'feed.search': 'Kaam search karein…',
  'feed.filters': 'Filter',
  'feed.distance': 'Doori',
  'feed.sortBy': 'Sort karein',
  'feed.closest': 'Sabse paas',
  'feed.highestBounty': 'Sabse zyada ₹',
  'feed.newest': 'Sabse naya',
  'feed.reset': 'Reset',
  'feed.showResults': 'Results dikhayein',
  'feed.refresh': 'Refresh',
  'feed.nothingNearby': 'Abhi paas mein kuch nahi',
  'feed.nothingNearbyBody':
    'Pehla kaam aap post karein. Koi paas wala utha lega — aam taur par kuch minutes mein.',
  'feed.noMatches': 'Koi kaam nahi mila',
  'feed.noMatchesBody': 'Filter hata ke dekhein ya doori badhayein.',
  'feed.postTask': 'Kaam post karein',
  'feed.widenSearch': 'Doori badhayein',
  'feed.expiryNote': 'Jo kaam koi nahi leta, wo apne aap hat jaata hai.',
  'feed.live': 'Live',
  'feed.cached': 'Aapki pichhli saved feed dikh rahi hai. Ye kaam pehle liye ja chuke ho sakte hain.',

  'location.enable': 'Location on karein',
  'location.enableBody':
    'Madad aapke aas-paas ke kaam dikhata hai, isliye location zaroori hai. On karke dobara try karein.',
  'location.enableButton': 'Location on karein',
  'location.tryAgain': 'Dobara try karein',
  'location.setManually': 'Apna ilaaka khud chunein',
  'location.approximate': 'Andaazan ilaaka',
  'location.approximateHint': 'Sahi doori ke liye GPS on karein',
  'location.manual': 'Aapka chuna ilaaka',
  'location.useMyLocation': 'Meri asli location lein',
  'location.pickTitle': 'Apna ilaaka chunein',
  'location.pickBody':
    'Apne ilaake, shehar ya kisi paas ki nishani ka naam likhein. Aap kabhi bhi GPS par wapas aa sakte hain.',
  'location.pickPlaceholder': 'jaise Kharghar, Panvel',
  'location.searching': 'Dhoond rahe hain…',
  'location.noResults': 'Is naam se koi jagah nahi mili. Koi bada paas ka shehar likhein.',
  'location.useThis': 'Yahi ilaaka chunein',

  'weather.unavailable': 'Mausam ki jaankari nahi',

  'task.bounty': 'Inaam',
  'task.claim': 'Ye kaam lein',
  'task.away': 'door',
  'task.expiresIn': '{n} min mein khatam',
  'task.postedBy': 'Post kiya',

  'safety.title': 'Safety',
  'safety.sos': 'SOS',
  'safety.sosTitle': 'Safety alert bhejein',
  'safety.sosBody':
    'Isse saamne wale ko pata chalega ki aapne dikkat batayi hai, Madad team ko khabar jaayegi, aur aapke emergency number par call karne ka option milega. Asli emergency mein 112 par call karein.',
  'safety.sosConfirm': 'Alert bhejein',
  'safety.sosRaised': 'Alert bhej diya',
  'safety.call112': '112 par call karein (emergency)',
  'safety.callContact': '{name} ko call karein',
  'safety.shareTrip': 'Mera safar share karein',
  'safety.shareTripBody':
    'Ek link banega jisme aapki live jagah aur manzil dikhegi. Kisi bharosemand ko bhejein. 6 ghante baad link band ho jaayega.',
  'safety.copyLink': 'Link copy karein',
  'safety.linkCopied': 'Link copy ho gaya — kisi bharosemand ko bhejein',
  'safety.endTrip': 'Share karna band karein',
  'safety.trustedContact': 'Emergency contact',
  'safety.trustedContactHint': 'Ye sirf aapko dikhta hai. Madad ise saamne wale ko kabhi nahi batata.',
  'safety.checklist': 'Milne se pehle',
  'safety.checklistItems': [
    'Kisi khuli, bheed wali jagah milein jahan log dekh sakein.',
    'Kisi ko batayein ki aap kahan ja rahe hain, ya apna safar share karein.',
    'Milne tak baat app mein hi rakhein.',
    'Kuch theek na lage to chale jaayein. Koi inaam isse bada nahi.',
  ],

  'profile.verification': 'Account checks',
  'profile.photo': 'Photo',
  'profile.changePhoto': 'Photo badlein',
  'profile.removePhoto': 'Photo hatayein',
  'profile.completionRate': 'Poora karne ki rate',
  'profile.totalEarned': 'Kamaya',
  'profile.totalSpent': 'Kharch',
  'profile.tasksDone': 'Poore kiye kaam',
  'profile.tasksPosted': 'Post kiye kaam',
  'profile.memberSince': 'Member bane',
  'profile.notVerifiedNote':
    'Madad pehchaan verify nahi karta. Ye activity ke checks hain, kisi ki pehchaan ka saboot nahi.',

  'push.enable': 'Notifications on karein',
  'push.enabled': 'Notifications on hain',
  'push.body': 'Paas mein naya kaam aane, aapka kaam liye jaane, ya payment pakka hone par khabar paayein.',
  'push.blocked': 'Aapke browser mein notifications band hain.',

  'common.save': 'Save karein',
  'common.cancel': 'Cancel',
  'common.close': 'Band karein',
  'common.done': 'Ho gaya',
  'common.retry': 'Dobara try karein',
  'common.loading': 'Load ho raha hai…',
  'common.offline': 'Offline — aapki pichhli saved feed dikh rahi hai.',
  'common.syncing': 'Sync ho raha hai…',
};

export const DICTIONARIES = { en, hi, hinglish };

/** English is the fallback for any key a translation has not reached yet. */
export const FALLBACK = 'en';

export default DICTIONARIES;
