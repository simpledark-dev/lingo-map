/**
 * Vietnamese string table. Mirrors en.ts key-for-key. Any key
 * missing here falls back to the English value at runtime via
 * t() so partial translation is safe.
 *
 * Tone: friendly, colloquial first-person voice. The story is
 * about an immigrant family making it work — the Vietnamese
 * voice should feel warm and a little wry, not formal.
 */

export const vi: Record<string, string> = {
  // ── Locale picker ──
  "localePicker.title": "Chọn ngôn ngữ mẹ đẻ",
  "localePicker.subtitle": "Sau này đổi trong Cài đặt cũng được nhé.",
  "localePicker.english": "English",
  "localePicker.vietnamese": "Tiếng Việt",
  "localePicker.selected": "Đang chọn",
  "localePicker.continue": "Tiếp tục ▶",

  // ── Target-language picker ──
  "targetPicker.title": "Bạn muốn học ngôn ngữ nào?",
  "targetPicker.subtitle": "Sau này đổi trong Cài đặt cũng được.",
  "targetPicker.lingo": "Lingo (ngôn ngữ thử nghiệm)",
  "targetPicker.french": "Tiếng Pháp",
  "targetPicker.english": "Tiếng Anh",
  "targetPicker.selected": "Đang chọn",
  "targetPicker.continue": "Tiếp tục ▶",
  "settings.targetLanguage": "Ngôn ngữ muốn học",

  // ── Welcome splash ──
  "welcome.title": "Survive Lingo",
  "welcome.tagline": "Sinh tồn ở thành phố mới. Học ngôn ngữ của họ.",
  "welcome.tapToBegin": "Chạm để bắt đầu",

  // ── Loading screen ──
  "loading.title": "SURVIVE LINGO",
  "loading.tagline": "Sinh tồn ở thành phố mới. Học ngôn ngữ của họ.",
  "loading.label": "Đang tải…",

  // ── Cutscene ──
  "cutscene.narratorArrival": "~ Thành phố mới. Cuộc đời mới. ~",
  "cutscene.busJourney":
    "Ba ngày ngồi xe buýt từ quê lên. Hai cái vali. Chỉ có hai cha con ta.",
  "cutscene.oldLifeInBags":
    "Tất cả những gì còn lại của cuộc sống trước đó sẽ ở lại trong quá khứ.",
  "cutscene.weMadeIt": "Thôi, đến nơi rồi.",
  "cutscene.papaWhatNow": "Ba ơi, giờ mình làm gì tiếp đây?",
  "cutscene.parentNamePrompt": "Trước tiên — tên ba là gì?",
  "cutscene.parentNamePlaceholder": "Tên của ba…",
  "cutscene.iAmAndThis": "Ba là {you}. Còn đây là…",
  "cutscene.childNamePrompt": "Còn con của ba tên gì?",
  "cutscene.childNamePlaceholder": "Tên con…",
  "cutscene.thisIsMyEverything": "…đây là {child}. Con là tất cả của ba.",
  "cutscene.rentedAPlace":
    "Ba có thuê được một chỗ ở. Hơi nhỏ nhưng tạm ở được.",
  "cutscene.letsGoInside": "Vào nhà thôi con.",
  "cutscene.tapOrEnter": "Chạm hoặc để tiếp tục",
  "cutscene.tapToSkip": "Chạm để bỏ qua…",
  "cutscene.next": "Tiếp ▶",
  "cutscene.begin": "Bắt đầu ▶",
  "cutscene.continue": "Tiếp ▶",
  "cutscene.typeNameToContinue": "Nhập tên để tiếp tục nhé.",

  // ── Apartment monologue ──
  "apartment.line.home": "Đây là nhà mình. Tạm thời thôi.",
  "apartment.line.smallButRent":
    "Nhỏ, đủ sống, và tiền nhà đã trả trước một tháng rồi.",
  "apartment.line.childHungry":
    "Ba ơi, con đói. Tủ lạnh không còn gì hết.",
  "apartment.line.foodAndFix":
    "Ba biết. Mình phải mua đồ ăn trước. Cái máy tính cũ ngoài kia hỏng rồi — cũng phải thay sớm thôi.",
  "apartment.line.needMoney": "Giờ thì… ba phải kiếm tiền gấp.",
  "apartment.line.sawAd":
    "Ba thấy báo có đăng tin tuyển phiên dịch ở phố Mart. Ba định đi thử.",
  "apartment.line.childObjection":
    "Hả? Nhưng mà ba đâu có biết tiếng Pháp đâu?",
  "apartment.line.iKnow": "Ba biết điều đó.",
  "apartment.line.fakeIt":
    "Nhưng ba sẽ giả vờ đến khi nào thành thạo luôn. Lúc phỏng vấn ba sẽ cười nhiều, gật đầu nhiều. Họ chẳng biết đâu.",
  "apartment.line.willItWork": "…Thế có ổn không ba?",
  "apartment.line.ithasTo": "Phải ổn thôi con.",
  "apartment.line.stayHere":
    "Con ở nhà ngoan nhé, {child}. Ba đi một lát, ba sẽ mang tin vui về.",

  // ── CEO ──
  "dialogue.ceo.greeting": "Chào người lạ. Tôi giúp gì được cho anh?",
  "dialogue.ceo.option.apply": "Tôi đến xin ứng tuyển công việc phiên dịch.",
  "dialogue.ceo.option.declineApply": "À không có gì. Xin lỗi.",
  "dialogue.ceo.option.declineApplyHint":
    "Anh quay lại bất cứ lúc nào cũng được.",
  "dialogue.ceo.fluencyQuestion":
    "Phiên dịch à? Tôi đang cần người thật. Nhưng mà, anh nói tiếng địa phương được không?",
  "dialogue.ceo.option.confident": "Tôi vô cùng thông thạo.",
  "dialogue.ceo.option.confidentHint": "(Nói dối trắng trợn)",
  "dialogue.ceo.option.honest": "Cũng tạm… tôi đang học.",
  "dialogue.ceo.option.honestHint": "(Nói thật lòng)",
  "dialogue.ceo.hireConfident":
    "Tự tin đấy. Được rồi, đừng để tôi thất vọng nhé. Anh bắt đầu luôn và ngay đi.",
  "dialogue.ceo.hireHonest":
    "“Cũng tạm” là ổn rồi. Thích anh vì nói thật. Vậy anh bắt đầu luôn nhé.",
  "dialogue.ceo.hireExplain":
    "Rất đơn giản: Dân quanh đây rất hay cần dịch mấy từ vựng. Anh lại bắt chuyện và dịch giúp họ, họ sẽ trả tiền cho từng câu đúng. Và tôi hưởng 1 phần.",
  "dialogue.ceo.hirePay":
    "Đúng một từ sẽ được {reward}. Dịch sai thì trừ {wrong}. Không biết thì bị trừ {idk}.",
  "dialogue.ceo.hireBonus":
    "Anh hãy kiếm đủ {threshold} rồi sau đó quay lại đây nhận thưởng thêm.",
  "dialogue.ceo.hireOffYouGo":
    "Eli đang ngồi bàn kia đợi anh — chỉ 4 từ thôi, việc đầu dễ lắm. Làm xong quay lại đây nhé.",
  "dialogue.ceo.paycheckClaimL1":
    "{name}! Nghe nói anh đã kiếm được {threshold} rồi. Cũng ra hồn đấy.",
  "dialogue.ceo.paycheckClaimL2":
    "Đây — thưởng {bonus} cho ngày đầu. Đừng tiêu hết ở Mart nhé.",
  "dialogue.ceo.paycheckClaimOption": "Nhận thưởng {bonus}",
  "dialogue.ceo.paycheckClaimOptionHint": "Anh xứng đáng mà.",
  "dialogue.ceo.paycheckMaybeLater": "Để sau vậy",
  "dialogue.ceo.paycheckCheckin1":
    "Đi phiên dịch ổn chứ {name}? Anh kiếm được {earned} rồi đấy.",
  "dialogue.ceo.paycheckCheckin2":
    "Đạt {threshold} là có thưởng thêm trên số anh đã kiếm.",
  "dialogue.ceo.paycheckClaimedL1":
    "Đây — thưởng {bonus}. Lần đầu chạy việc mà vậy là không tệ.",
  "dialogue.ceo.paycheckClaimedL2":
    "Tiếp theo là Rina. Vẫn đúng bốn từ của Eli, nhưng cô ấy kẹt ở phần nghe.",
  "dialogue.ceo.standard":
    "Khi nào sẵn sàng nhận hợp đồng đầu tiên thì quay lại.",

  // ── Eli ──
  "dialogue.eli.preHire":
    "Tôi chờ phiên dịch viên chính thức đây. Anh nói chuyện với sếp trước đi.",
  "dialogue.eli.offer": "Ê anh phiên dịch! Có bốn từ thôi, làm nhanh không?",
  "dialogue.eli.offerLine":
    "Ê phiên dịch viên mới! Tôi đợi anh nãy giờ — bốn từ thôi, làm chung không?",
  "dialogue.eli.fallback": "Ê anh phiên dịch mới! Rảnh chút không?",
  "dialogue.eli.modeReadOnly": "1. Đọc & dịch",
  "dialogue.eli.modeReadOnlyHint": "Đọc từ rồi chọn nghĩa của nó.",
  "dialogue.eli.modeDecline": "Để sau",
  "dialogue.eli.modeDeclineHint": "Tôi vẫn ngồi bàn này.",

  // ── Office tutorial NPCs (Eli / Rina / Yusuf) ──
  "dialogue.officeTutor.modePrompt": "Đây là chỗ tôi yếu.",
  "dialogue.listenTutor.thanks":
    "Giúp được rồi — giờ tôi nghe thấy mấy từ này rõ luôn. Nếu được thì giúp Yusuf tiếp nhé. Vẫn bốn từ đó, nhưng anh ấy bị khựng khi phải nhớ lại và gõ ra.",
  "dialogue.writeTutor.thanks":
    "Hiểu rồi. Giờ chắc tôi tự viết được mấy từ này luôn. Cảm ơn anh đã kiên nhẫn nhé.",

  // ── Listen tutor (second-paycheck NPC) ──
  "dialogue.listenTutor.preHire":
    "Tôi đang đợi phiên dịch viên — anh nói chuyện với sếp trước đi.",
  "dialogue.listenTutor.offer":
    "Đọc thì tôi hiểu được, nhưng nghe nói ra là chịu. Giúp tôi luyện qua âm thanh được không?",
  "dialogue.listenTutor.modeListen": "2. Nghe & dịch",
  "dialogue.listenTutor.modeListenHint": "Nghe rồi chọn nghĩa.",
  "dialogue.listenTutor.modeDecline": "Để sau",
  "dialogue.listenTutor.modeDeclineHint": "Anh quay lại lúc nào cũng được.",

  // ── Write tutor (third-paycheck NPC) ──
  "dialogue.writeTutor.preHire":
    "Phiên dịch viên chưa tới — anh nói chuyện với sếp trước đi.",
  "dialogue.writeTutor.offer":
    "Tôi nhìn từ thì nhận ra, nhưng mà tới lúc cần dùng là quên sạch. Giúp tôi tập viết từ theo nghĩa được không?",
  "dialogue.writeTutor.modeWrite": "3. Viết theo nghĩa",
  "dialogue.writeTutor.modeWriteHint": "Thấy nghĩa thì gõ từ.",
  "dialogue.writeTutor.modeDecline": "Để sau",
  "dialogue.writeTutor.modeDeclineHint": "Lúc nào cũng được nhé.",

  // ── Theo (lender) ──
  "dialogue.theo.youOwe": "Anh còn nợ tôi {debt}. Muốn vay thêm hay trả bớt?",
  "dialogue.theo.canSpot":
    "Cần tiền gấp không? Tôi cho vay mỗi lần 5 đô, tối đa 20 đô.",
  "dialogue.theo.borrow": "Vay {amount}",
  "dialogue.theo.borrowHint": "Sau khi vay: {after} (tối đa {cap})",
  "dialogue.theo.borrowMaxedHint": "Anh vay tối đa rồi — trả bớt đi đã.",
  "dialogue.theo.repay": "Trả {amount}",
  "dialogue.theo.repayLabelEmpty": "Trả nợ",
  "dialogue.theo.repayHint": "Trả hết số anh đang có luôn.",
  "dialogue.theo.repayNothingHint": "Không có tiền để trả.",
  "dialogue.theo.repayBrokeHint": "Anh hết sạch tiền rồi.",
  "dialogue.theo.maybeLater": "Để sau",
  "dialogue.theo.lendStub": "Cần giúp không? Tôi cho vay ít.",
  "dialogue.theo.afterBorrow": "Đây {amount}. Giờ anh nợ tôi {total}.",
  "dialogue.theo.squareUp": "Trả hết rồi — sạch nợ. {amount} đã nhận.",

  // ── Mim (child) ──
  "dialogue.mim.fallback": "Hi ba!",
  "dialogue.mim.goodLuckDad":
    "Ba đi cẩn thận nhé! Con chờ ở nhà. Ba mang tin vui về nha!",
  "dialogue.mim.thanksForSandwich":
    "Cảm ơn ba mua bánh mì cho con. Con thương ba nhất.",
  "dialogue.mim.imHungry":
    "Con đói quá ba ơi… Ba qua Mart mua bánh mì sandwich cho con được không?…",
  "dialogue.mim.didYouGet": "Ba mua bánh mì cho con chưa?",
  "dialogue.mim.giveSandwich": "Đưa bánh mì 🥪",
  "dialogue.mim.notYet": "Con chờ thêm chút nữa",
  "dialogue.mim.preFirstPaycheck": "Ba ơi… mình ổn chứ ba?",
  "dialogue.mim.thanksNow": "Ngon quá! Cảm ơn ba!",
  "dialogue.mim.noSandwich": "Ơ? Đâu ạ? Ba chưa mua mà…",

  // ── Translator-offer ──
  "dialogue.offer.generic":
    "Ê! Anh là phiên dịch viên mới phải không? Tôi đang bí mấy từ này. Giúp tôi với được không?",
  "dialogue.offer.help": "Được, để tôi thử",
  "dialogue.offer.helpHint": "Từ đúng được tiền, sai bị trừ.",
  "dialogue.offer.view": "Xem trước ({count} từ)",
  "dialogue.offer.viewHint":
    "Xem từ, nghe phát âm, luyện thoải mái (không mất tiền)",
  "dialogue.offer.decline": "Xin lỗi, lần sau nhé",
  "dialogue.offer.modePrompt": "Tôi cần giúp với một trong mấy phần này.",
  "dialogue.offer.modeRead": "1. Đọc & dịch",
  "dialogue.offer.modeReadHint": "Thấy từ trên màn, chọn nghĩa. · Tốn 1 ⚡",
  "dialogue.offer.modeListen": "2. Nghe & dịch",
  "dialogue.offer.modeListenHint": "Nghe từ phát ra, chọn nghĩa. · Tốn 1 ⚡",
  "dialogue.offer.modeWrite": "3. Viết từ nghĩa",
  "dialogue.offer.modeWriteHint": "Thấy nghĩa, gõ từ. · Tốn 1 ⚡",
  "dialogue.offer.modeSpeak": "4. Nói từ nghĩa",
  "dialogue.offer.modeSpeakHint": "Thấy nghĩa, đọc to từ.",
  "dialogue.offer.modeBack": "← Quay lại",
  "dialogue.offer.modeBackHint": "Quay lại các lựa chọn trước.",

  // ── Map NPC small talk ──
  "npc.pokemon.mira.line1": "Ồ, chào bạn! Chắc bạn mới tới thị trấn.",
  "npc.pokemon.mira.line2": "Mart nằm phía đông, đi qua con đường kia.",
  "npc.pokemon.hank.line1": "Mart là của gia đình tôi ba đời rồi.",
  "npc.pokemon.hank.line2": "Cần gì thì ở đây cũng có.",
  "npc.pokemon.riku.line1": "Tôi đang chờ suất chiếu tiếp theo ở rạp.",
  "npc.pokemon.riku.line2": "Tối nay chiếu phim quái vật cũ đó!",
  "npc.pokemon.sumi.line1": "Chào buổi sáng! Thử bánh ở tiệm lúc còn nóng đi.",
  "npc.pokemon.kit.line1": "Ê ê! Đua tới cái cây kia không?",
  "npc.pokemon.kit.line2": "...thôi được, bạn thắng.",
  "npc.pokemon.tomas.line1": "Chỗ xây dựng này làm mấy tuần rồi.",
  "npc.pokemon.tomas.line2": "Họ chẳng bao giờ xong.",
  "npc.pokemon.ada.line1": "Tôi trễ ca rồi. Cho tôi qua nhé!",
  "npc.pokemon.jun.line1":
    "Bạn có thấy con mèo hoang nào không? Đen, chân trắng.",
  "npc.pokemon.pia.line1": "Xe chạy rất nhanh ở khúc cua đó. Cẩn thận nha.",
  "npc.pokemon.olek.line1": "Bạn trả sách chưa? Thư viện đóng cửa lúc 6 giờ.",
  "npc.pokemon.esme.line1": "Hôm nay tuyến phát thư lâu kinh khủng.",
  "npc.pokemon.bo.line1": "Tôi cũng mới chuyển tới. Vẫn đang học đường sá.",
  "npc.pokemon.nora.line1": "Trông bạn như đi bộ cả buổi sáng rồi ấy.",
  "npc.pokemon.reza.line1": "Tôi làm rơi chìa khóa đâu đó trên con phố này...",
  "npc.pokemon.yuki.line1": "Tối nay rạp chiếu phim nước ngoài. Có phụ đề!",
  "npc.pokemon.cleo.line1": "Tôi đang chờ giao hàng. Họ nói trước trưa sẽ tới.",
  "npc.pokemon.cleo.offer":
    "Ồ — bạn là phiên dịch viên đúng không? Nhanh giúp tôi mấy từ này trong lúc tôi chờ hàng nhé?",
  "npc.pokemon.otis.line1": "Mart đó bán cơm nắm ngon nhất.",
  "npc.pokemon.saba.line1": "Lẽ ra tôi phải đi làm, nhưng trời đẹp quá.",
  "npc.pokemon.saba.offer":
    "Ê phiên dịch viên! Giúp tôi luyện mấy con số này với.",
  "npc.pokemon.vera.line1": "Chào mừng đến khu phố này, bạn nhé.",
  "npc.grocer.shopkeeper.line1": "Chào mừng!",
  "npc.house.pio.line1":
    "Tôi chỉ đang chơi trong nhà thôi. Hỏi tôi về mấy động từ hằng ngày nhé?",
  "npc.house.pio.offer":
    "Phiên dịch viên! Giúp tôi luyện mấy động từ hằng ngày — ăn, ngủ, kiểu vậy.",

  // ── Dialogue controls ──
  "dialogue.control.tapContinue": "Chạm để tiếp tục",
  "dialogue.control.tapSkip": "Chạm để bỏ qua...",
  "dialogue.control.close": "Đóng ▶",
  "dialogue.control.next": "▶",
  "dialogue.control.indicatorClose": "▼ chạm để đóng",
  "dialogue.control.indicatorContinue": "▼ chạm để tiếp",

  // ── Shop ──
  "shop.defaultName": "Cửa hàng",
  "shop.welcome":
    "Chào mừng đến {name}! Muốn xem qua thử danh sách đồ ăn không?",
  "shop.option.browse": "Xem hàng",
  "shop.option.leave": "Để sau",
  "shop.walletTip": "Tiền trong ví",
  "shop.closeAriaLabel": "Đóng cửa hàng",
  "shop.forSaleHeader": "Hàng bán",
  "shop.buy": "Mua",

  // ── Locked district ──
  "lockedDistrict.message": "Phải đến được {title} mới vào khu này được.",
  "mapMarker.office": "Văn phòng",
  "mapMarker.mart": "Mart",
  "mapMarker.home": "Nhà",
  "mapMarker.exit": "Lối ra",
  "mapMarker.upstairs": "Lầu trên",
  "mapMarker.downstairs": "Lầu dưới",
  "mapMarker.collectPaycheck": "Nhận lương",
  "dialogue.fallback.hiThere": "Chào bạn.",

  // ── Quest titles & objectives ──
  "quest.introTranslatorJob.title": "Xin Việc Phiên Dịch",
  "quest.introTranslatorJob.objective":
    "Đến văn phòng phiên dịch trên phố Mart. Nói chuyện với sếp để xin việc và bắt đầu kiếm tiền.",
  "quest.introTranslatorJob.completedSummary":
    "Bạn đã nhận được việc phiên dịch (dù chưa giỏi thật).",

  "quest.firstPaycheck.title": "Lương Đầu Tiên",
  "quest.firstPaycheck.objective":
    "Làm job 4 từ với Eli. Kiếm đủ {threshold} rồi quay lại gặp sếp nhận thưởng.",
  "quest.firstPaycheck.completedSummary":
    "Nhận lương lần đầu. Sếp cho thêm chút thưởng.",
  "quest.firstPaycheck.availableHint":
    "Sếp hứa có lương khi bạn đã chứng minh được — cứ tiếp tục dịch.",
  "quest.secondPaycheck.title": "Nghe & Dịch",
  "quest.secondPaycheck.objective":
    "Anh tutor mới ở văn phòng kẹt phần nghe — kiếm thêm {threshold} ở chế độ Nghe.",
  "quest.secondPaycheck.completedSummary":
    "Bạn đã học cách dịch qua tai.",
  "quest.thirdPaycheck.title": "Viết Theo Nghĩa",
  "quest.thirdPaycheck.objective":
    "Anh tutor thứ ba muốn DÙNG được từ — kiếm thêm {threshold} ở chế độ Viết.",
  "quest.thirdPaycheck.completedSummary":
    "Bạn đã học cách viết từ đã biết.",

  "quest.childSandwich.title": "Bánh Mì Cho {child}",
  "quest.childSandwich.objectivePreAsk":
    "{child} muốn nói chuyện với bạn. Về nhà đi.",
  "quest.childSandwich.objective":
    "{child} đang đói. Mua bánh mì ở Mart mang về cho con.",
  "quest.childSandwich.completedSummary": "{child} đã no bụng. Bớt một nỗi lo.",
  "quest.upgradeComputer.title": "Thay Cái Máy Tính Cũ",
  "quest.upgradeComputer.objective":
    "Cái máy tính ở nhà chết queo rồi. Chạm vào nó và chọn Nâng cấp để đổi sang cái còn chạy được.",
  "quest.upgradeComputer.completedSummary":
    "Bạn đã thay máy tính mới. Cuối cùng cũng học được ở nhà.",

  "quest.tutorialBorrow.title": "Vay Tiền Tạm",
  "quest.tutorialBorrow.objective":
    "Hết tiền thì tìm Theo ngoài đường, ông ấy cho vay ít.",
  "quest.tutorialBorrow.completedSummary": "Đã vay tiền từ Theo.",

  "quest.tutorialBuyFood.title": "Mua Đồ Ăn Ở Siêu Thị",
  "quest.tutorialBuyFood.objective": "Mua thứ gì đó ăn được ở Mart.",
  "quest.tutorialBuyFood.completedSummary": "Đã mua đồ ăn.",

  "quest.tutorialEat.title": "Ăn Để Bù Năng Lượng",
  "quest.tutorialEat.objective": "Hết năng lượng thì mở Túi và ăn đồ vừa mua.",
  "quest.tutorialEat.completedSummary": "Biết rồi: mệt thì phải ăn.",

  // ── Quest log ──
  "questLog.title": "Nhiệm vụ",
  "questLog.title.current": "Nhiệm vụ hiện tại",
  "questLog.tab.active": "Đang làm",
  "questLog.tab.completed": "Đã xong",
  "questLog.tab.available": "Sẵn sàng",
  "questLog.empty.active": "Chưa có nhiệm vụ nào.",
  "questLog.empty.completed": "Chưa hoàn thành nhiệm vụ nào.",
  "questLog.empty.available": "Chưa có nhiệm vụ mới.",
  "questLog.close": "Đóng",

  "questToast.newQuest": "Nhiệm vụ mới",
  "questToast.questComplete": "Hoàn thành",
  "questToast.targetReached": "Đủ mục tiêu",
  "questToast.firstPaycheckReady": "Quay lại gặp sếp để nhận lương.",

  // ── Quest HUD ──
  "questHud.activeOverview": "Tổng quan nhiệm vụ đang làm",
  "questHud.openDetails": "Mở chi tiết nhiệm vụ: {title}",
  "questHud.newBadge": "MỚI",
  "questHud.readyBadge": "XONG",
  "questHud.paycheckReadyTitle": "Có Lương Rồi",
  "questHud.paycheckReadyAction": "Gặp sếp",
  "questHud.targetReached": "Đủ mục tiêu",

  // ── HUD ──
  "hud.bag": "Túi",
  "hud.energy": "Năng lượng",
  "hud.energyAmount": "Năng lượng: {current} trên {max}",
  "hud.energyAmountShort": "Năng lượng {current}/{max}",
  "hud.outOfEnergyTip": "Hết năng lượng — ăn gì đó để tiếp tục làm việc.",
  "hud.coins": "Tiền",
  "hud.debt": "Nợ Theo",
  "hud.openLog": "Nhiệm vụ",
  "hud.openSettings": "Cài đặt",
  "hud.openInventory": "Mở túi",
  "hud.inventorySummary": "Túi đồ, chạm để mở: {items}",
  "hud.inventoryItemCount": "{count} {item}",
  "hud.openWordStats": "Thống kê từ",
  "hud.openMinimap": "Bản đồ",
  "hud.muteMusic": "Tắt nhạc",
  "hud.unmuteMusic": "Bật nhạc",

  // ── Touch controls ──
  "controls.movementControls": "Điều khiển di chuyển",

  // ── Intro hint ──
  "introHint.officeAria": "Gợi ý: Đi đến văn phòng phiên dịch trên phố Mart",
  "introHint.officeLabel": "📍 Văn Phòng Phiên Dịch — Phố Mart",

  // ── Minimap ──
  "minimap.you": "Bạn",
  "minimap.house": "Nhà",
  "minimap.cafe": "Quán cà phê",
  "minimap.restaurant": "Nhà hàng",
  "minimap.bookstore": "Nhà sách",
  "minimap.market": "Chợ",
  "minimap.bakery": "Tiệm bánh",
  "minimap.inn": "Nhà trọ",
  "minimap.blacksmith": "Lò rèn",
  "minimap.npc": "NPC",
  "minimap.close": "Đóng bản đồ",

  // ── Settings ──
  "settings.title": "Cài đặt",
  "settings.language": "Ngôn ngữ",
  "settings.languageEnglish": "English",
  "settings.languageVietnamese": "Tiếng Việt",
  "settings.visuals": "Hiển thị",
  "settings.markerLabelStyle": "Kiểu chữ nhãn trên bản đồ",
  "settings.controls": "Điều khiển",
  "settings.virtualDpad": "Phím ảo",
  "settings.virtualDpadHint":
    "Hiện nút điều khiển di chuyển trên màn hình điện thoại.",
  "settings.dangerZone": "Vùng nguy hiểm",
  "settings.resetTitle": "Xoá toàn bộ tiến trình",
  "settings.resetWarning":
    "Sẽ xoá hết vị trí, tiền bạc, đồ đạc, năng lượng, nợ nần, nhiệm vụ, tên nhân vật và tiến trình từ vựng. Câu chuyện mở đầu sẽ chạy lại từ đầu.",
  "settings.resetCannotUndo": "Không thể hoàn tác đâu.",
  "settings.resetButton": "Xoá tiến trình…",
  "settings.resetAreYouSure": "Bạn chắc chắn muốn xoá hết không?",
  "settings.resetYes": "Có, xoá hết",
  "settings.resetCancel": "Huỷ",
  "settings.devHeader": "Dev",
  "settings.devLifetime": "Tổng tiền đã kiếm: {amount}. Dùng để test nhanh.",
  "settings.devEarn1": "Kiếm +$1.00",
  "settings.devEarn5": "Kiếm +$5.00",
  "settings.devReward": "Thưởng mỗi từ đúng: {amount}. Áp dụng ngay.",
  "settings.close": "Đóng",

  // ── Inventory ──
  "inventory.title": "Túi đồ",
  "inventory.empty": "Túi của ba đang trống trơn.",
  "inventory.eat": "Ăn",
  "inventory.eatHint": "Hồi {energy} năng lượng.",
  "inventory.eatRestoresLabel": "Hồi",
  "inventory.energyTip": "Năng lượng",
  "inventory.energyFullTip": "Năng lượng đã đầy",
  "inventory.eatTip": "Ăn để hồi +{energy} năng lượng",
  "inventory.close": "Đóng",

  // ── Vocabulary list view ──
  "wordlist.title": "Từ vựng của {name}",
  "wordlist.theme": "{theme}",
  "wordlist.practice": "Luyện tập",
  "wordlist.back": "◀ Quay lại",
  "wordlist.tapToHear": "Chạm vào từ để nghe phát âm",
  "wordlist.examples": "Ví dụ",
  "wordlist.posLabel.noun": "danh từ",
  "wordlist.posLabel.verb": "động từ",
  "wordlist.posLabel.adjective": "tính từ",
  "wordlist.posLabel.pronoun": "đại từ",
  "wordlist.posLabel.preposition": "giới từ",
  "wordlist.posLabel.conjunction": "liên từ",
  "wordlist.posLabel.question": "từ hỏi",
  "wordlist.posLabel.number": "số",
  "wordlist.posLabel.time": "thời gian",
  "wordlist.posLabel.greeting": "lời chào",

  // ── Practice picker ──
  "practicePicker.title": "Chọn chế độ luyện",
  "practicePicker.heading": "Bạn muốn luyện kiểu nào?",
  "practicePicker.subheading": "Không mất tiền — luyện thoải mái.",
  "practicePicker.with": "Luyện với {name}",
  "practicePicker.read": "1. Đọc & chọn nghĩa",
  "practicePicker.readHint": "Thấy từ, chọn nghĩa đúng.",
  "practicePicker.listen": "2. Nghe & chọn nghĩa",
  "practicePicker.listenHint": "Nghe phát âm, chọn nghĩa.",
  "practicePicker.write": "3. Viết từ theo nghĩa",
  "practicePicker.writeHint": "Thấy nghĩa, gõ từ vào.",
  "practicePicker.speak": "4. Nói theo nghĩa",
  "practicePicker.speakHint": "Thấy nghĩa, đọc to từ đó.",
  "practicePicker.cancel": "Huỷ",
  "practicePicker.soon": "SẮP CÓ",
  "practice.hiddenWordAria": "Từ đang ẩn — nghe và chọn nghĩa",
  "practice.next.correct": "Hay lắm! Tiếp ▶",
  "practice.next.studied": "Đã hiểu — Tiếp ▶",
  "practice.prompt.writeQuestion": "Viết từ này thế nào…",
  "practice.prompt.listenQuestion": "Nghe kỹ — bạn vừa nghe gì?",
  "practice.prompt.readQuestion": "Từ này nghĩa là gì?",
  "practice.hearIt": "nghe từ",
  "practice.hearAgain": "nghe lại",
  "practice.pronounceAria": "Phát âm {word}",
  "practice.hearAgainAria": "Nghe lại",
  "practice.hideDetails": "Ẩn chi tiết",
  "practice.showDetails": "Chạm để xem nghĩa & ví dụ",

  // ── Translate session ──
  "translate.prompt.read": "Từ này nghĩa là gì?",
  "translate.prompt.listen": "Bạn nghe:",
  "translate.prompt.write": "Gõ từ cho nghĩa sau:",
  "translate.prompt.writeQuestion": "Viết từ này thế nào…",
  "translate.prompt.listenQuestion": "Nghe kỹ — bạn vừa nghe gì?",
  "translate.headerFor": "Đang dịch cho {name}",
  "translate.modeHint.read": "Đọc từ, chọn nghĩa.",
  "translate.modeHint.listen": "Nghe và chọn nghĩa.",
  "translate.modeHint.write": "Thấy nghĩa, gõ từ.",
  "translate.hearIt": "nghe từ",
  "translate.hearAgain": "nghe lại",
  "translate.pronounceAria": "Phát âm {word}",
  "translate.idk": "Tôi không biết",
  "translate.idkHint": "Bỏ qua, không đoán. Mất ít tiền hơn trả lời sai.",
  "translate.next": "Tiếp ▶",
  "translate.endSession": "Kết thúc phiên",
  "translate.studyDetails": "Chạm từ để xem ví dụ.",
  "translate.write.submit": "Gửi ▶",
  "translate.idkAction": "🤷 Tôi không biết — cho xem đáp án",
  "translate.next.correct": "Hay lắm! Tiếp ▶",
  "translate.next.studied": "Đã hiểu — Tiếp ▶",
  "translate.endButton": "Kết thúc ▶",
  "translate.studyHide": "Ẩn chi tiết",
  "translate.studyTap": "Chạm để xem nghĩa & ví dụ",
  "translate.coinsLabel": "Tiền",
  "translate.write.placeholder": "Gõ từ…",
  "translate.write.correct": "Đúng rồi!",
  "translate.write.wrong": "Đáp án đúng là: {answer}",
  "translate.outOfEnergy.title": "Hết năng lượng rồi",
  "translate.outOfEnergy.haveFood":
    "Ba mệt quá không làm tiếp được. Mở Túi ăn gì đó rồi quay lại với {name} nhé.",
  "translate.outOfEnergy.canAfford":
    "Ba mệt quá. Còn {balance} tiền — qua Mart mua đồ ăn rồi quay lại với {name}.",
  "translate.outOfEnergy.broke":
    "Ba mệt quá mà không còn tiền mua đồ ăn ({balance}). Tìm Theo ngoài đường vay ít tiền tạm nhé.",
  "translate.outOfEnergy.close": "Đóng",
  "translate.summary.title": "Tổng kết phiên làm việc",
  "translate.summary.successLabel": "Tỉ lệ đúng",
  "translate.summary.correctRow": "{count} đúng",
  "translate.summary.wrongRow": "{count} sai",
  "translate.summary.skippedRow": "{count} bỏ qua",
  "translate.summary.totalRow": "{count} tổng",
  "translate.summary.earnedLabel": "Kiếm được",
  "translate.summary.lostLabel": "Mất",
  "translate.summary.netLabel": "Ròng",
  "translate.summary.wordsToReview": "Từ cần ôn lại",
  "translate.summary.cleanSession":
    "Phiên hoàn hảo! Không sai từ nào. Giỏi lắm!",
  "translate.summary.noRoundsAnswered":
    "Chưa trả lời câu nào. Quay lại khi sẵn sàng nhé.",
  "translate.summary.close": "Đóng",

  // ── Word stats ──
  "wordStats.title": "Thống kê từ vựng",
  "wordStats.totalWords": "Đã gặp {count} từ",
  "wordStats.mastered": "Đã thuộc",
  "wordStats.learning": "Đang học",
  "wordStats.struggling": "Còn khó",
  "wordStats.empty": "Hãy đi dịch từ để xem tiến bộ của mình.",
  "wordStats.close": "Đóng",
  "wordStats.closeAria": "Đóng thống kê",
  "wordStats.lifetimeTip":
    "Tổng cộng: {correct} đúng / {wrong} sai trong {seen} lần",
  "wordStats.hearIt": "nghe từ",
  "wordStats.fromPack": "Từ",
  "wordStats.filter.all": "Tất cả",
  "wordStats.filter.allHint": "Tất cả từ, sắp xếp theo bảng chữ cái.",
  "wordStats.filter.mostCorrect": "Đúng nhiều nhất",
  "wordStats.filter.mostCorrectHint": "Những từ bạn trả lời đúng nhiều nhất.",
  "wordStats.filter.mostWrong": "Sai nhiều nhất",
  "wordStats.filter.mostWrongHint": "Những từ hay bị sai nhất.",
  "wordStats.filter.worstRatio": "Tỉ lệ tệ nhất",
  "wordStats.filter.worstRatioHint": "Những từ có tỉ lệ đúng thấp nhất.",
  "wordStats.filter.notSeen": "Chưa gặp",
  "wordStats.filter.notSeenHint": "Những từ chưa từng xuất hiện.",
  "wordStats.notSeenShort": "chưa gặp",
  "wordStats.filter.inReview": "Đang ôn",
  "wordStats.filter.inReviewHint": "Những từ đang được đánh dấu ôn lại.",

  // ── Items ──
  "item.sandwich.name": "Bánh mì",
  "item.sandwich.description":
    "Bánh mì kẹp phô mai với thịt nguội. Đơn giản nhưng no bụng.",
  "item.onigiri.name": "Cơm nắm",
  "item.onigiri.description": "Tam giác cơm với nhân mặn bên trong, rất tiện.",
  "item.apple.name": "Quả táo",
  "item.apple.description":
    "Táo giòn, chua chua ngọt ngọt. Lau qua áo rồi cắn.",
  "item.donut.name": "Bánh donut",
  "item.donut.description":
    "Bánh vòng phủ đường. Không bổ dưỡng lắm nhưng ngon miệng.",
  "item.milk.name": "Hộp sữa",
  "item.milk.description": "Hộp sữa lạnh, uống mát lạnh.",
  "item.cookie.name": "Bánh quy",
  "item.cookie.description": "Bánh quy socola chip. Ăn cho đỡ thèm.",

  // ── Apartment computer ──
  "computer.name": "Máy tính",
  "computer.dialogue.prompt.broken":
    "Màn hình tối thui và nứt vỡ. Bàn phím hầu như không phản hồi.",
  "computer.dialogue.prompt.usedLaptop":
    "Một màn hình mới đang vận hành êm ru. Bàn phím sẵn sàng để dùng.",
  "computer.dialogue.prompt.homePc":
    "Một chiếc laptop cũ nằm mở trên bàn, nắp trầy xước nhưng vẫn hấp dẫn.",
  "computer.dialogue.prompt.studyRig":
    "Một chiếc laptop bóng bẩy đang chờ, màn hình sáng và bàn phím nhẹ tênh.",
  "computer.option.study": "Học",
  "computer.option.upgrade": "Nâng cấp",
  "computer.option.leave": "Rời đi",
  "computer.study.broken":
    "Máy không bật lên. Màn hình vẫn đen thui. Cần có máy tính dùng được trước khi học ở đây.",
  "computer.study.ready":
    "Máy tính khởi động ổn. Chế độ học ở nhà sẽ sớm nằm ở đây.",
  "computer.upgrade.title": "Nâng cấp máy tính",
  "computer.upgrade.subtitle":
    "Nâng cấp góc bàn để căn phòng này thành nơi học thật sự.",
  "computer.upgrade.closeAria": "Đóng nâng cấp máy tính",
  "computer.upgrade.current": "Hiện tại",
  "computer.upgrade.owned": "Đã có",
  "computer.upgrade.next": "Tiếp theo",
  "computer.upgrade.locked": "Chưa mở",
  "computer.upgrade.button": "Bắt đầu nâng cấp — {price}",
  "computer.upgrade.runningButton": "Đang nâng cấp… {time}",
  "computer.upgrade.speedupButton": "⚡ Tăng tốc — Dịch từ",
  "computer.speedup.title": "Tăng tốc",
  "computer.speedup.back": "← Quay lại",
  "computer.speedup.question": "“{word}” nghĩa là gì?",
  "computer.speedup.hint": "Mỗi câu đúng sẽ rút bớt {seconds} giây.",
  "computer.speedup.timeAdded": "-{seconds}s ⚡",
  "computer.upgrade.finishButton": "Hoàn tất nâng cấp",
  "computer.upgrade.maxedButton": "Đã nâng cấp tối đa",
  "computer.upgrade.inProgress": "Đang chạy",
  "computer.upgrade.ready": "Sẵn sàng",
  "computer.upgrade.success": "Đã nâng cấp thành {item}.",
  "computer.upgrade.needMoney": "Cần thêm {amount}.",
  "computer.upgrade.maxed": "Máy tính này đã nâng cấp tối đa rồi.",
  "computer.level.broken.name": "Màn hình hỏng",
  "computer.level.broken.description":
    "Màn hình chết, bàn phím cũ. Chưa học được gì.",
  "computer.level.usedLaptop.name": "Màn hình mới",
  "computer.level.usedLaptop.description":
    "Màn hình sạch sẽ và bàn phím còn tốt. Đủ để học bài cơ bản.",
  "computer.level.homePc.name": "Laptop cũ",
  "computer.level.homePc.description":
    "Cũ và trầy xước, nhưng linh hoạt. Có thể học ở bất kỳ đâu trong phòng.",
  "computer.level.studyRig.name": "Laptop mới",
  "computer.level.studyRig.description":
    "Nhanh, gọn, thoải mái. Một chiếc máy học ngôn ngữ thật sự.",

  // ── Errors / fallbacks ──
  "common.unknown": "…",
  "common.soon": "SẮP CÓ",
  "common.examples": "Ví dụ",
};
