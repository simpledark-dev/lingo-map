/**
 * English string table. Acts as the SOURCE OF TRUTH for every
 * native-language string in the game; vi.ts mirrors these keys
 * with Vietnamese translations.
 *
 * Conventions:
 * - Keys are dotted paths: `area.subArea.key`. Group by surface
 *   (cutscene, dialogue.ceo, quest.firstPaycheck, hud, etc.)
 *   so adding a new string puts it next to its neighbours.
 * - Use `{name}` placeholders for runtime substitution (player
 *   names, numbers, etc.). t() handles substitution.
 * - Keep strings full sentences, not fragments — spreading a
 *   single sentence across keys is brittle to translate.
 * - Sentences end with their own punctuation. NEVER include
 *   leading/trailing whitespace.
 */

export const en: Record<string, string> = {
  // ── Locale picker ──
  "localePicker.title": "Pick your native language",
  "localePicker.subtitle": "You can change this later in Settings.",
  "localePicker.english": "English",
  "localePicker.vietnamese": "Tiếng Việt",
  "localePicker.selected": "Selected",
  "localePicker.continue": "Continue ▶",

  // ── Target-language picker ──
  "targetPicker.title": "What do you want to learn?",
  "targetPicker.subtitle": "You can change this later in Settings.",
  "targetPicker.lingo": "Lingo (test language)",
  "targetPicker.french": "French",
  "targetPicker.english": "English",
  "targetPicker.selected": "Selected",
  "targetPicker.continue": "Continue ▶",
  // Settings section labels — mirror the existing language picker
  // so the in-Settings selector reads the same way as the boot
  // picker.
  "settings.targetLanguage": "Language to learn",

  // ── Welcome splash ──
  "welcome.title": "Survive Lingo",
  "welcome.tagline": "Survive a new city. Learn its language.",
  "welcome.tapToBegin": "Tap to begin",

  // ── Loading screen ──
  "loading.title": "SURVIVE LINGO",
  "loading.tagline": "Survive a new city. Learn its language.",
  "loading.label": "loading…",

  // ── Cutscene ──
  "cutscene.narratorArrival": "~ A new city. A new life. ~",
  "cutscene.busJourney":
    "Three days on the bus from home. Two suitcases. Just us.",
  "cutscene.oldLifeInBags": "Whatever's left of the old life is in those bags.",
  "cutscene.weMadeIt": "Okay. We made it.",
  "cutscene.papaWhatNow": "Papa. What do we do now?",
  "cutscene.parentNamePrompt": "First — what's your name?",
  "cutscene.parentNamePlaceholder": "Your name…",
  "cutscene.iAmAndThis": "I'm {you}. And this is…",
  "cutscene.childNamePrompt": "And your child's name?",
  "cutscene.childNamePlaceholder": "Their name…",
  "cutscene.thisIsMyEverything": "…this is {child}. My everything.",
  "cutscene.rentedAPlace": "I rented us a place. Small, but it's ours for now.",
  "cutscene.letsGoInside": "Come on. Let's go inside.",
  "cutscene.tapOrEnter": "Tap or press Enter to continue",
  "cutscene.tapToSkip": "Tap to skip…",
  "cutscene.next": "Next ▶",
  "cutscene.begin": "Begin ▶",
  "cutscene.continue": "Continue ▶",
  "cutscene.typeNameToContinue": "Type a name to continue.",

  // ── Apartment monologue ──
  "apartment.line.home": "This is our home. For now.",
  "apartment.line.smallButRent":
    "It's small. Bare. But the rent's paid for a month.",
  "apartment.line.childHungry":
    "Dad, I'm hungry. There's nothing in the fridge.",
  "apartment.line.foodAndFix":
    "I know. We'll need food first. And that broken computer in the corner — we'll have to replace it soon, too.",
  "apartment.line.needMoney": "After that... I need money. Quickly.",
  "apartment.line.sawAd":
    "I saw an ad in the paper — translation office on Mart Street. I'm going to apply.",
  "apartment.line.childObjection":
    "Wait — but you don't even speak the language!",
  "apartment.line.iKnow": "I know.",
  "apartment.line.fakeIt":
    "I'll fake it till I make it. Smile. Nod. They won't have to know.",
  "apartment.line.willItWork": "...Will it work?",
  "apartment.line.ithasTo": "It has to.",
  "apartment.line.stayHere":
    "Stay here, {child}. I'll come back with good news.",

  // ── CEO ──
  "dialogue.ceo.greeting": "Welcome, stranger. What can I do for you?",
  "dialogue.ceo.option.apply": "I’m here to apply for the translator job.",
  "dialogue.ceo.option.declineApply": "Ah, nothing — nevermind.",
  "dialogue.ceo.option.declineApplyHint": "You can come back any time.",
  "dialogue.ceo.fluencyQuestion":
    "A translator? Yes — we are looking for one. Tell me, are you fluent in our tongue?",
  "dialogue.ceo.option.confident": "Completely fluent.",
  "dialogue.ceo.option.confidentHint": "(A bold lie.)",
  "dialogue.ceo.option.honest": "Mostly… working on it.",
  "dialogue.ceo.option.honestHint": "(Honest enough.)",
  "dialogue.ceo.hireConfident":
    "Confidence. Good — don't make me regret this. The job is yours.",
  "dialogue.ceo.hireHonest":
    "Mostly's enough. Honest answer too — that's worth something. The job is yours.",
  "dialogue.ceo.hireExplain":
    "The way it works: people around town need help with words. You walk up, translate, they pay you per correct answer. I take a small cut.",
  "dialogue.ceo.hirePay":
    "Pays {reward} for every word you nail. Lose {wrong} on a wrong guess — focus matters. And {idk} if you admit you don’t know it.",
  "dialogue.ceo.hireBonus":
    "Earn {threshold} translating and circle back — there’s a bonus waiting on top.",
  "dialogue.ceo.hireOffYouGo":
    "Eli's at the desk waiting on you — only four words, easy first job. Get those done and circle back if you want a bigger street route.",
  "dialogue.ceo.paycheckClaimL1":
    "{name}! Word is you've cleared {threshold} translating. That's a real paycheck.",
  "dialogue.ceo.paycheckClaimL2":
    "Here — bonus of {bonus} for showing up. Don't blow it all at the Mart.",
  "dialogue.ceo.paycheckClaimOption": "Claim {bonus} bonus",
  "dialogue.ceo.paycheckClaimOptionHint": "You earned it.",
  "dialogue.ceo.paycheckMaybeLater": "Maybe later",
  "dialogue.ceo.paycheckCheckin1":
    "Translating going alright, {name}? You're at {earned} so far.",
  "dialogue.ceo.paycheckCheckin2":
    "Hit {threshold} earned and there's a bonus waiting for you on top of what you've already pocketed.",
  "dialogue.ceo.paycheckClaimedL1":
    "There you go — {bonus} bonus. Not bad for your first real run.",
  "dialogue.ceo.paycheckClaimedL2":
    "Next up is Rina. Exact same four words Eli had, but she struggles when she has to listen to them.",
  "dialogue.ceo.standard":
    "Come back when you are ready for your first contract.",

  // ── Eli (in-office first customer) ──
  "dialogue.eli.preHire":
    "I'll wait for an actual translator — talk to the CEO first.",
  "dialogue.eli.offer":
    "Hey, the translator! Got four words to drill — quick run?",
  "dialogue.eli.offerLine":
    "Hey, the new translator. I've been waiting — only got four words for you, mind running them with me?",
  "dialogue.eli.fallback": "Hey, the new translator! Got a sec?",
  "dialogue.eli.modeReadOnly": "1. Read & translate",
  "dialogue.eli.modeReadOnlyHint":
    "See each word in writing, pick its meaning.",
  "dialogue.eli.modeDecline": "Not now",
  "dialogue.eli.modeDeclineHint": "I'll be at this desk.",

  // ── Office tutorial NPCs (Eli / Rina / Yusuf) ──
  // Custom mode-picker prompt — the office tutors only expose ONE
  // mode each, so the generic "I need help with one of these"
  // copy reads wrong (there's only one option). This line frames
  // the single-option picker as the NPC narrowing in on their
  // specific weakness.
  "dialogue.officeTutor.modePrompt": "This is what I struggle with.",
  // Post-session thank-you lines — fired when the player ends a
  // session that crossed the quest's phase threshold. Holds the
  // narrative beat (NPC closes the loop) BEFORE the next-quest
  // toast lands, so the chain reads as Eli ✓ → "thanks" → Rina
  // unlocks rather than a silent dollar number triggering a
  // banner mid-session.
  "dialogue.listenTutor.thanks":
    "That really helped — I can actually HEAR these now. If you can, help Yusuf next. Same four words, but he freezes when he has to recall and type them.",
  "dialogue.writeTutor.thanks":
    "Got it. I think I can actually USE these words now. Thanks for your patience.",

  // ── Listen tutor (second-paycheck NPC) ──
  "dialogue.listenTutor.preHire":
    "I'm waiting on the office translator — talk to the CEO first.",
  "dialogue.listenTutor.offer":
    "I can read these words just fine, but the moment someone says them out loud I'm lost. Mind drilling some with me by ear?",
  "dialogue.listenTutor.modeListen": "2. Listen & translate",
  "dialogue.listenTutor.modeListenHint":
    "Hear each word spoken, pick its meaning.",
  "dialogue.listenTutor.modeDecline": "Not now",
  "dialogue.listenTutor.modeDeclineHint": "Come back when you have a minute.",

  // ── Write tutor (third-paycheck NPC) ──
  "dialogue.writeTutor.preHire":
    "Translator's not in yet — talk to the CEO first.",
  "dialogue.writeTutor.offer":
    "I recognise these words when I see them, but the second I have to USE one I freeze up. Help me practise spelling them out from the meaning?",
  "dialogue.writeTutor.modeWrite": "3. Write from meaning",
  "dialogue.writeTutor.modeWriteHint": "See the meaning — type the word.",
  "dialogue.writeTutor.modeDecline": "Not now",
  "dialogue.writeTutor.modeDeclineHint": "Anytime is fine.",

  // ── Theo (lender) ──
  "dialogue.theo.youOwe":
    "You owe me {debt}. Need more, or are you here to pay up?",
  "dialogue.theo.canSpot":
    "Need a hand? I can spot you five at a time, up to twenty.",
  "dialogue.theo.borrow": "Borrow {amount}",
  "dialogue.theo.borrowHint": "Owed after: {after} (cap {cap})",
  "dialogue.theo.borrowMaxedHint": "You’re maxed out — pay some back first.",
  "dialogue.theo.repay": "Repay {amount}",
  "dialogue.theo.repayLabelEmpty": "Repay",
  "dialogue.theo.repayHint": "Pays everything you can right now.",
  "dialogue.theo.repayNothingHint": "Nothing to repay.",
  "dialogue.theo.repayBrokeHint": "You don’t have any cash on you.",
  "dialogue.theo.maybeLater": "Maybe later",
  "dialogue.theo.lendStub": "Need a hand? I lend small.",
  "dialogue.theo.afterBorrow": "Here's {amount}. You now owe me {total}.",
  "dialogue.theo.squareUp": "Paid in full — we’re square. {amount} settled.",

  // ── Mim (child sandwich) ──
  "dialogue.mim.fallback": "Hi!",
  "dialogue.mim.goodLuckDad":
    "Good luck, dad! I'll wait here. Bring back some good news!",
  "dialogue.mim.thanksForSandwich":
    "Thanks for the sandwich earlier! I love you, dad.",
  "dialogue.mim.imHungry":
    "I'm hungry… can you go to the Mart and grab me a sandwich? Please?",
  "dialogue.mim.didYouGet": "Did you get my sandwich?",
  "dialogue.mim.giveSandwich": "Give the sandwich 🥪",
  "dialogue.mim.notYet": "Not yet",
  "dialogue.mim.preFirstPaycheck": "Hi dad. Are we okay?",
  "dialogue.mim.thanksNow": "Yes! Thank you, dad!",
  "dialogue.mim.noSandwich": "Huh? Where? You didn’t buy it…",

  // ── Translator-offer (engine fallback used by NPCs without dialogueKind) ──
  "dialogue.offer.generic":
    "Hey! You're the new translator in town, right? I'm really struggling with these words. Can you help me?",
  "dialogue.offer.help": "Sure, I'll give it a shot",
  "dialogue.offer.helpHint":
    "Earn money for every word you get right. Wrong ones will cost you.",
  "dialogue.offer.view": "Let me look them over first ({count} words)",
  "dialogue.offer.viewHint":
    "Browse the list, hear how they sound, practice freely — no money on the line.",
  "dialogue.offer.decline": "Sorry, not right now",
  "dialogue.offer.modePrompt": "I need help with one of these.",
  "dialogue.offer.modeRead": "1. Read & translate",
  "dialogue.offer.modeReadHint":
    "See each word in writing, pick its meaning. · Costs 1 ⚡",
  "dialogue.offer.modeListen": "2. Listen & translate",
  "dialogue.offer.modeListenHint":
    "Hear each word spoken, pick its meaning. · Costs 1 ⚡",
  "dialogue.offer.modeWrite": "3. Write from meaning",
  "dialogue.offer.modeWriteHint":
    "See the meaning, type the word. · Costs 1 ⚡",
  "dialogue.offer.modeSpeak": "4. Speak from meaning",
  "dialogue.offer.modeSpeakHint": "See the meaning, say the word out loud.",
  "dialogue.offer.modeBack": "← Back",
  "dialogue.offer.modeBackHint": "Return to the previous choices.",

  // ── Map NPC small talk ──
  "npc.pokemon.mira.line1": "Oh, hi there! You must be new in town.",
  "npc.pokemon.mira.line2": "The Mart is just east past the path.",
  "npc.pokemon.hank.line1": "Mart's been in my family three generations.",
  "npc.pokemon.hank.line2": "Anything you need, we've got it.",
  "npc.pokemon.riku.line1": "I'm waiting for the next showing at the cinema.",
  "npc.pokemon.riku.line2": "Old monster movies tonight!",
  "npc.pokemon.sumi.line1": "Morning! Try the bakery while it's warm.",
  "npc.pokemon.kit.line1": "Hey, hey! Wanna race to that tree?",
  "npc.pokemon.kit.line2": "...okay, fine, you win.",
  "npc.pokemon.tomas.line1": "Construction's been going on for weeks.",
  "npc.pokemon.tomas.line2": "They never finish.",
  "npc.pokemon.ada.line1": "I'm late for my shift. Excuse me!",
  "npc.pokemon.jun.line1": "Have you seen a stray cat? Black with white socks.",
  "npc.pokemon.pia.line1":
    "The cars get really fast around the bend. Be careful.",
  "npc.pokemon.olek.line1":
    "Did you bring your book back? Library closes at 6.",
  "npc.pokemon.esme.line1": "Postal route takes forever today.",
  "npc.pokemon.bo.line1": "I just moved here. Still figuring out the streets.",
  "npc.pokemon.nora.line1": "You look like you've been walking all morning.",
  "npc.pokemon.reza.line1": "I lost my keys somewhere on this street...",
  "npc.pokemon.yuki.line1":
    "Cinema's playing something foreign tonight. Subtitles!",
  "npc.pokemon.cleo.line1": "Waiting on a delivery. They said before noon.",
  "npc.pokemon.cleo.offer":
    "Oh — translator, right? Quick, while I wait on this delivery — help me with these words?",
  "npc.pokemon.otis.line1": "That mart sells the best onigiri.",
  "npc.pokemon.saba.line1": "I should be at work but the weather is too nice.",
  "npc.pokemon.saba.offer":
    "Yo the translator! Help me drill these numbers please.",
  "npc.pokemon.vera.line1": "Welcome to the neighborhood, friend.",
  "npc.grocer.shopkeeper.line1": "Welcome!",
  "npc.house.pio.line1":
    "Just hanging around the house. Ask me about everyday verbs?",
  "npc.house.pio.offer":
    "Translator! Help me drill these everyday verbs — eat, sleep, that kind of thing.",

  // ── Dialogue controls ──
  "dialogue.control.tapContinue": "Tap to continue",
  "dialogue.control.tapSkip": "Tap to skip...",
  "dialogue.control.close": "Close ▶",
  "dialogue.control.next": "▶",
  "dialogue.control.indicatorClose": "▼ tap to close",
  "dialogue.control.indicatorContinue": "▼ tap to continue",

  // ── Shop ──
  "shop.defaultName": "Shop",
  "shop.welcome": "Welcome to {name}! Want to take a look?",
  "shop.option.browse": "Browse items",
  "shop.option.leave": "Maybe later",
  "shop.walletTip": "Your wallet",
  "shop.closeAriaLabel": "Close shop",
  "shop.forSaleHeader": "For sale",
  "shop.buy": "Buy",

  // ── Locked district ──
  "lockedDistrict.message": "You must reach {title} to visit this district.",
  "mapMarker.office": "Office",
  "mapMarker.mart": "Mart",
  "mapMarker.home": "Home",
  "mapMarker.exit": "Exit",
  "mapMarker.upstairs": "Upstairs",
  "mapMarker.downstairs": "Downstairs",
  "mapMarker.collectPaycheck": "Collect Paycheck",
  "dialogue.fallback.hiThere": "Hi there.",

  // ── Quest titles ──
  "quest.introTranslatorJob.title": "Apply for the Translator Job",
  "quest.introTranslatorJob.objective":
    "Head to the office on Mart Street. Apply with the CEO so you can start earning.",
  "quest.introTranslatorJob.completedSummary":
    "You talked your way into the translator role — fluency optional.",
  "quest.firstPaycheck.title": "Earn Your First Paycheck",
  "quest.firstPaycheck.objective":
    "Eli's at the office with a four-word job — drill it as many times as you need. Earn {threshold} total, then return to the CEO for your bonus.",
  "quest.firstPaycheck.completedSummary":
    "You earned your first paycheck. The CEO threw in a small bonus on top.",
  "quest.firstPaycheck.availableHint":
    "The CEO promised a paycheck once you’ve earned your stripes — keep translating.",
  "quest.secondPaycheck.title": "Listen & Translate",
  "quest.secondPaycheck.objective":
    "A new tutor in the office struggles with audio — earn another {threshold} in Listen mode.",
  "quest.secondPaycheck.completedSummary":
    "You learned to translate by listening.",
  "quest.thirdPaycheck.title": "Write from Meaning",
  "quest.thirdPaycheck.objective":
    "The third tutor wants to USE words, not just recognise them — earn another {threshold} in Write mode.",
  "quest.thirdPaycheck.completedSummary":
    "You learned to write the words you've learned.",
  "quest.childSandwich.title": "A Sandwich for {child}",
  "quest.childSandwich.objectivePreAsk":
    "{child} wanted to talk to you. Head home.",
  "quest.childSandwich.objective":
    "{child} is hungry. Buy a sandwich at the Mart and bring it home.",
  "quest.childSandwich.completedSummary":
    "{child} ate. One less thing to worry about today.",
  "quest.upgradeComputer.title": "Replace the Broken Computer",
  "quest.upgradeComputer.objective":
    "The computer at home is dead. Tap it and pick Upgrade to swap it for something that actually works.",
  "quest.upgradeComputer.completedSummary":
    "You replaced the broken computer. Studying from home is finally possible.",
  "quest.tutorialBorrow.title": "Borrow Some Cash",
  "quest.tutorialBorrow.objective":
    "Out of pocket money? Theo on the street can spot you a small loan.",
  "quest.tutorialBorrow.completedSummary":
    "You borrowed from Theo. Money in pocket — debt on the books.",
  "quest.tutorialBuyFood.title": "Buy Some Food",
  "quest.tutorialBuyFood.objective":
    "Buy something edible at the Mart shop counter.",
  "quest.tutorialBuyFood.completedSummary":
    "You bought food. Eat it next time energy gets low.",
  "quest.tutorialEat.title": "Eat When Tired",
  "quest.tutorialEat.objective":
    "Energy low? Open your bag and eat the food you bought. It refills your stamina so you can keep working.",
  "quest.tutorialEat.completedSummary":
    "You learned the eat-to-recover loop. Keep food on hand.",

  // ── Quest log ──
  "questLog.title": "Quests",
  "questLog.title.current": "Current Quest",
  "questLog.tab.active": "Active",
  "questLog.tab.completed": "Completed",
  "questLog.tab.available": "Available",
  "questLog.empty.active": "Nothing active right now.",
  "questLog.empty.completed": "You haven't completed anything yet.",
  "questLog.empty.available": "No new quests available.",
  "questLog.close": "Close",

  // ── Quest toast ──
  "questToast.newQuest": "New Quest",
  "questToast.questComplete": "Quest Complete",
  "questToast.targetReached": "Target Reached",
  "questToast.firstPaycheckReady": "Return to the CEO for your paycheck.",

  // ── Quest HUD ──
  "questHud.activeOverview": "Active quests overview",
  "questHud.openDetails": "Open quest details: {title}",
  "questHud.newBadge": "NEW",
  "questHud.readyBadge": "READY",
  "questHud.paycheckReadyTitle": "Paycheck Ready",
  "questHud.paycheckReadyAction": "Talk to CEO",
  "questHud.targetReached": "Target reached",

  // ── HUD ──
  "hud.bag": "Bag",
  "hud.energy": "Energy",
  "hud.energyAmount": "Energy: {current} of {max}",
  "hud.energyAmountShort": "Energy {current}/{max}",
  "hud.outOfEnergyTip": "Out of energy — eat something to keep working.",
  "hud.coins": "Coins",
  "hud.debt": "Debt to Theo",
  "hud.openLog": "Open quest log",
  "hud.openSettings": "Open settings",
  "hud.openInventory": "Open inventory",
  "hud.inventorySummary": "Inventory, tap to open: {items}",
  "hud.inventoryItemCount": "{count} {item}",
  "hud.openWordStats": "Open word stats",
  "hud.openMinimap": "Open minimap",
  "hud.muteMusic": "Mute background music",
  "hud.unmuteMusic": "Unmute background music",

  // ── Touch controls ──
  "controls.movementControls": "Movement controls",

  // ── Intro hint ──
  "introHint.officeAria":
    "Tutorial hint: head to the translation office on Mart Street",
  "introHint.officeLabel": "📍 Translation Office — Mart Street",

  // ── Minimap ──
  "minimap.you": "You",
  "minimap.house": "House",
  "minimap.cafe": "Cafe",
  "minimap.restaurant": "Restaurant",
  "minimap.bookstore": "Bookstore",
  "minimap.market": "Market",
  "minimap.bakery": "Bakery",
  "minimap.inn": "Inn",
  "minimap.blacksmith": "Blacksmith",
  "minimap.npc": "NPC",
  "minimap.close": "Close Map",

  // ── Settings ──
  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.languageEnglish": "English",
  "settings.languageVietnamese": "Tiếng Việt",
  "settings.visuals": "Visuals",
  "settings.markerLabelStyle": "Marker label style",
  "settings.controls": "Controls",
  "settings.virtualDpad": "Virtual D-pad",
  "settings.virtualDpadHint": "Show on-screen movement controls on mobile.",
  "settings.tapMoveSound": "Tap-to-move sound",
  "settings.tapMoveSoundHint": "Play a soft click on each tap to move. Off by default.",
  "settings.dangerZone": "Danger zone",
  "settings.resetTitle": "Reset game",
  "settings.resetWarning":
    "Wipes location, wallet, inventory, energy, debt, quests, names, and vocab progress. The opening cutscene will play again.",
  "settings.resetCannotUndo": "This cannot be undone.",
  "settings.resetButton": "Reset game…",
  "settings.resetAreYouSure": "Are you sure?",
  "settings.resetYes": "Yes, wipe everything",
  "settings.resetCancel": "Cancel",
  "settings.devHeader": "Dev",
  "settings.devLifetime":
    "Lifetime earnings: {amount}. Skip the grind while testing quest milestones.",
  "settings.devEarn1": "Earn +$1.00",
  "settings.devEarn5": "Earn +$5.00",
  "settings.devReward":
    "Correct-answer reward: {amount}. Applies to new correct vocabulary answers immediately.",
  "settings.close": "Close",

  // ── Inventory ──
  "inventory.title": "Bag",
  "inventory.empty": "Your bag is empty.",
  "inventory.eat": "Eat",
  "inventory.eatHint": "Restores {energy} energy.",
  "inventory.eatRestoresLabel": "Restores",
  "inventory.energyTip": "Energy",
  "inventory.energyFullTip": "Energy already full",
  "inventory.eatTip": "Eat for +{energy} energy",
  "inventory.close": "Close",

  // ── Vocabulary list view ──
  "wordlist.title": "{name}’s words",
  "wordlist.theme": "{theme}",
  "wordlist.practice": "Practice",
  "wordlist.back": "◀ Back",
  "wordlist.tapToHear": "Tap a word to hear it",
  "wordlist.examples": "Examples",
  "wordlist.posLabel.noun": "noun",
  "wordlist.posLabel.verb": "verb",
  "wordlist.posLabel.adjective": "adjective",
  "wordlist.posLabel.pronoun": "pronoun",
  "wordlist.posLabel.preposition": "preposition",
  "wordlist.posLabel.conjunction": "conjunction",
  "wordlist.posLabel.question": "question",
  "wordlist.posLabel.number": "number",
  "wordlist.posLabel.time": "time",
  "wordlist.posLabel.greeting": "greeting",

  // ── Practice picker ──
  "practicePicker.title": "Practice mode",
  "practicePicker.heading": "How would you like to practice?",
  "practicePicker.subheading": "No money on the line — drill freely.",
  "practicePicker.with": "Practice with {name}",
  "practicePicker.read": "1. Read & match",
  "practicePicker.readHint": "See each word in writing, pick its meaning.",
  "practicePicker.listen": "2. Listen & match",
  "practicePicker.listenHint": "Hear each word spoken, pick its meaning.",
  "practicePicker.write": "3. Write from meaning",
  "practicePicker.writeHint": "See the meaning, type the word.",
  "practicePicker.speak": "4. Speak from meaning",
  "practicePicker.speakHint": "See the meaning, say the word out loud.",
  "practicePicker.cancel": "Cancel",
  "practicePicker.soon": "SOON",
  "practice.hiddenWordAria": "Hidden word — listen and pick the meaning",
  "practice.next.correct": "Nice! Next ▶",
  "practice.next.studied": "Got it — Next ▶",
  "practice.prompt.writeQuestion": "How do you write…",
  "practice.prompt.listenQuestion": "Listen carefully — what did you hear?",
  "practice.prompt.readQuestion": "What does this mean?",
  "practice.hearIt": "hear it",
  "practice.hearAgain": "hear again",
  "practice.pronounceAria": "Pronounce {word}",
  "practice.hearAgainAria": "Hear it again",
  "practice.hideDetails": "Hide details",
  "practice.showDetails": "Tap to see meaning & examples",

  // ── Translate session ──
  "translate.prompt.read": "What does this mean?",
  "translate.prompt.listen": "You hear:",
  "translate.prompt.write": "Type the word for:",
  "translate.prompt.writeQuestion": "How do you write…",
  "translate.prompt.listenQuestion": "Listen carefully — what did you hear?",
  "translate.headerFor": "Translating for {name}",
  "translate.modeHint.read": "Read the word, pick its meaning.",
  "translate.modeHint.listen": "Listen and pick the meaning.",
  "translate.modeHint.write": "See the meaning — type the word.",
  "translate.hearIt": "hear it",
  "translate.hearAgain": "hear again",
  "translate.pronounceAria": "Pronounce {word}",
  "translate.idk": "I don't know",
  "translate.idkHint": "Skip without guessing. Costs less than a wrong answer.",
  "translate.next": "Next ▶",
  "translate.endSession": "End session",
  "translate.studyDetails": "Tap the word to see examples.",
  "translate.write.submit": "Submit ▶",
  "translate.idkAction": "🤷 I don't know — show me",
  "translate.next.correct": "Next ▶",
  "translate.next.studied": "Next ▶",
  "translate.endButton": "End ▶",
  "translate.studyHide": "Hide details",
  "translate.studyTap": "Tap to see meaning & examples",
  "translate.coinsLabel": "Coins",
  "translate.write.placeholder": "Type the word…",
  "translate.write.correct": "Correct!",
  "translate.write.wrong": "The answer was {answer}",
  "translate.outOfEnergy.title": "Out of energy",
  "translate.outOfEnergy.haveFood":
    "You're too tired to keep working. Open your Bag and eat something to refill, then come back to {name}.",
  "translate.outOfEnergy.canAfford":
    "You're too tired to keep working. You have {balance} — head to the Mart and buy a snack, then come back to {name}.",
  "translate.outOfEnergy.broke":
    "You're too tired to keep working — and you can't afford food on {balance}. Find Theo on the path; he'll spot you a small loan you can pay back later.",
  "translate.outOfEnergy.close": "Close",
  "translate.summary.title": "Session Summary",
  "translate.summary.successLabel": "Success",
  "translate.summary.correctRow": "{count} correct",
  "translate.summary.wrongRow": "{count} wrong",
  "translate.summary.skippedRow": "{count} skipped",
  "translate.summary.totalRow": "{count} total",
  "translate.summary.earnedLabel": "earned",
  "translate.summary.lostLabel": "lost",
  "translate.summary.netLabel": "Net",
  "translate.summary.wordsToReview": "Words to review",
  "translate.summary.cleanSession":
    "Clean session — no words missed. Nicely done.",
  "translate.summary.noRoundsAnswered":
    "No rounds answered. Come back when you're ready.",
  "translate.summary.close": "Close",

  // ── Word stats ──
  "wordStats.title": "Word Stats",
  "wordStats.totalWords": "{count} words seen",
  "wordStats.mastered": "Mastered",
  "wordStats.learning": "Learning",
  "wordStats.struggling": "Struggling",
  "wordStats.empty": "Translate words to see your progress.",
  "wordStats.close": "Close",
  "wordStats.closeAria": "Close stats",
  "wordStats.lifetimeTip":
    "Lifetime {correct} correct / {wrong} wrong across {seen} answers",
  "wordStats.hearIt": "hear it",
  "wordStats.fromPack": "From",
  "wordStats.filter.all": "All words",
  "wordStats.filter.allHint": "Every word, alphabetical.",
  "wordStats.filter.mostCorrect": "Most correct",
  "wordStats.filter.mostCorrectHint": "Words you've nailed the most.",
  "wordStats.filter.mostWrong": "Most wrong",
  "wordStats.filter.mostWrongHint": "Words you've missed the most.",
  "wordStats.filter.worstRatio": "Worst ratio",
  "wordStats.filter.worstRatioHint":
    "Lowest correct % among words you've seen.",
  "wordStats.filter.notSeen": "Not seen yet",
  "wordStats.filter.notSeenHint": "Untouched words across every pack.",
  "wordStats.notSeenShort": "not seen",
  "wordStats.filter.inReview": "In review queue",
  "wordStats.filter.inReviewHint": "Currently flagged for forced review.",

  // ── Items ──
  "item.sandwich.name": "Sandwich",
  "item.sandwich.description":
    "Soft bread, cheese, a slice of something. Lunchbox classic.",
  "item.onigiri.name": "Onigiri",
  "item.onigiri.description":
    "Triangle of warm rice with a salty surprise inside.",
  "item.apple.name": "Apple",
  "item.apple.description":
    "Crisp, tart, polished on a sleeve before the bite.",
  "item.donut.name": "Donut",
  "item.donut.description":
    "Glazed ring of dubious nutritional value. Worth it.",
  "item.milk.name": "Milk",
  "item.milk.description": "Cold carton, slightly damp on the outside.",
  "item.cookie.name": "Cookie",
  "item.cookie.description": "Chocolate-chip. The cheap, reliable comfort.",

  // ── Apartment computer ──
  "computer.name": "Computer",
  "computer.dialogue.prompt.broken":
    "The screen sits dark and cracked. The keyboard barely responds.",
  "computer.dialogue.prompt.usedLaptop":
    "A fresh monitor hums softly. The keyboard is ready for work.",
  "computer.dialogue.prompt.homePc":
    "An old laptop rests open on the desk, lid scratched but inviting.",
  "computer.dialogue.prompt.studyRig":
    "A sleek laptop waits, screen bright and keys whisper-quiet.",
  "computer.option.study": "Study",
  "computer.option.upgrade": "Upgrade",
  "computer.option.leave": "Leave",
  "computer.study.broken":
    "It will not turn on. The screen stays black. You need a working computer before you can study here.",
  "computer.study.ready":
    "The computer boots up cleanly. Home study mode will be ready here soon.",
  "computer.upgrade.title": "Computer Upgrade",
  "computer.upgrade.subtitle":
    "Upgrade the desk setup so this room can become a real place to study.",
  "computer.upgrade.closeAria": "Close computer upgrade",
  "computer.upgrade.current": "Current",
  "computer.upgrade.owned": "Owned",
  "computer.upgrade.next": "Next",
  "computer.upgrade.locked": "Locked",
  "computer.upgrade.button": "Start Upgrade — {price}",
  "computer.upgrade.runningButton": "Upgrading… {time}",
  "computer.upgrade.speedupButton": "⚡ Want to speed up? Translate words!",
  "computer.speedup.title": "Speed Up",
  "computer.speedup.back": "← Back",
  "computer.speedup.question": "What does “{word}” mean?",
  "computer.speedup.hint": "Each correct answer cuts {seconds}s off the timer.",
  "computer.speedup.timeAdded": "-{seconds}s ⚡",
  "computer.speedup.next": "Next →",
  "computer.upgrade.finishButton": "Finish Upgrade",
  "computer.upgrade.maxedButton": "Fully upgraded",
  "computer.upgrade.inProgress": "In Progress",
  "computer.upgrade.ready": "Ready",
  "computer.upgrade.success": "Upgraded to {item}.",
  "computer.upgrade.needMoney": "You need {amount} more.",
  "computer.upgrade.maxed": "This computer is already fully upgraded.",
  "computer.level.broken.name": "Broken Screen",
  "computer.level.broken.description":
    "Dead screen, tired keyboard. You can't study with this.",
  "computer.level.usedLaptop.name": "New Screen",
  "computer.level.usedLaptop.description":
    "A clean monitor and a working keyboard. Basic lessons run fine.",
  "computer.level.homePc.name": "Used Laptop",
  "computer.level.homePc.description":
    "Old and scratched, but portable. Study anywhere in the room.",
  "computer.level.studyRig.name": "New Laptop",
  "computer.level.studyRig.description":
    "Fast, clean, and comfortable. A real language-learning machine.",

  // ── Errors / fallbacks ──
  "common.unknown": "…",
  "common.soon": "SOON",
  "common.examples": "Examples",
};
