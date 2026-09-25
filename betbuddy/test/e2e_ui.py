"""End-to-end UI walk-through: real app + real SQL (via local shim). Saves screenshots."""
import subprocess, sys, os
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:4173"
SHOTS = sys.argv[1] if len(sys.argv) > 1 else "/tmp/claude-0/shots"
os.makedirs(SHOTS, exist_ok=True)

def sql(q):
    return subprocess.check_output(["su", "postgres", "-c", f'psql -tA -d bbe2e -c "{q}"']).decode().strip()

def shot(page, name):
    page.wait_for_timeout(700)
    page.screenshot(path=f"{SHOTS}/{name}.png")
    print("  shot", name)

def login(page, phone, name, invite=None):
    page.goto(BASE + (f"/?invite={invite}" if invite else "/"))
    page.get_by_placeholder("(413) 555-0100").fill(phone)
    page.get_by_role("button", name="Text me a code").click()
    page.get_by_placeholder("••••••").fill("123456")
    page.get_by_placeholder("e.g. Uncle Rich").fill(name)
    page.get_by_text("I'm 21 or older").click()
    page.get_by_role("button", name="Let's go →").click()
    expect(page.get_by_text("PENDING", exact=True).first).to_be_visible(timeout=8000)

def tab(page, name):
    page.locator("div[style*='position: fixed'][style*='bottom: 0']").get_by_text(name, exact=True).click()

def balance(name):
    return int(sql(f"select coalesce(sum(amount),0) from ledger l join profiles p on p.id=l.user_id where p.name='{name}'"))

with sync_playwright() as p:
    b = p.chromium.launch()
    mk = lambda: b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2).new_page()
    mo, dad, uncle = mk(), mk(), mk()
    for pg in (mo, dad, uncle):
        pg.on("pageerror", lambda e: print("  PAGE ERROR:", e))

    mo.goto(BASE); shot(mo, "01_login")
    login(mo, "4135550100", "Mo")
    mo_id = sql("select id from profiles where name='Mo'")
    assert sql("select is_admin from profiles where name='Mo'") == "t"
    login(dad, "4135550101", "Dad", invite=mo_id)
    login(uncle, "4135550102", "Uncle Rich", invite=mo_id)
    dad.wait_for_timeout(800)
    assert sql("select count(*) from friendships") == "2", "invites created friendships"
    shot(dad, "02_dad_home_empty")

    # Dad adds $100
    tab(dad, "Locker"); dad.get_by_text("Add Funds", exact=True).click()
    dad.get_by_role("button", name="$100").click(); dad.get_by_role("button", name="Continue — $100").click()
    shot(dad, "03_add_funds_venmo")
    dad.get_by_role("button", name="✓ I sent $100").click(); dad.get_by_role("button", name="Done").click()

    # Mo funds himself + approves both in The Bank
    tab(mo, "Locker"); mo.get_by_text("Add Funds", exact=True).click()
    mo.get_by_placeholder("Custom amount").fill("250"); mo.get_by_role("button", name="Continue — $250").click()
    mo.get_by_role("button", name="✓ I sent $250").click(); mo.get_by_role("button", name="Done").click()
    mo.reload(); tab(mo, "Locker"); mo.get_by_text("The Bank (Admin)").click()
    expect(mo.get_by_text("DEPOSITS TO CONFIRM (2)")).to_be_visible()
    shot(mo, "04_bank_admin")
    mo.get_by_role("button", name="✓ Received — credit it").first.click(); mo.wait_for_timeout(600)
    mo.get_by_role("button", name="✓ Received — credit it").first.click(); mo.wait_for_timeout(600)
    assert balance("Dad") == 100 and balance("Mo") == 250, (balance("Dad"), balance("Mo"))
    mo.get_by_label("Close").click()

    # Dad challenges Mo: Bills -6.5 for $25
    dad.reload(); tab(dad, "Games"); shot(dad, "05_games")
    dad.locator("button", has_text="Dolphins").first.click()
    dad.locator("button", has_text="Mo").first.click()
    dad.get_by_role("button", name="Bills -6.5 Favorite").click()
    dad.get_by_role("button", name="$25").click()
    dad.get_by_placeholder("Say something...").fill("Bills by double digits 🦬")
    shot(dad, "06_bet_slip")
    dad.get_by_role("button", name="🎯 Challenge Mo — $25").click()
    expect(dad.get_by_text("SENT & PENDING")).to_be_visible()
    assert balance("Dad") == 75

    # Mo accepts
    mo.reload(); tab(mo, "Inbox"); shot(mo, "07_mo_inbox")
    mo.get_by_role("button", name="✅ Accept").click()
    expect(mo.get_by_text("$25 vs. Dad")).to_be_visible()
    assert balance("Mo") == 225

    # Uncle: funded by admin adjustment, posts a Field bet on Cowboys +4.5
    sql(f"insert into ledger (user_id, amount, kind, memo) select id, 50, 'adjustment', 'test' from profiles where name='Uncle Rich'")
    uncle.reload(); tab(uncle, "Games")
    uncle.locator("button", has_text="Cowboys").first.click()
    uncle.get_by_text("The Field", exact=True).click()
    uncle.get_by_role("button", name="Cowboys +4.5 Underdog").click()
    uncle.get_by_role("button", name="$25").click()
    uncle.get_by_role("button", name="🎲 Post to The Field — $25").click()
    mo.reload(); tab(mo, "Inbox"); shot(mo, "08_mo_field_offer")

    # Trash talk
    dad.reload(); tab(dad, "Home")
    dad.get_by_text("Trash Talk").first.click()
    dad.get_by_placeholder("Trash talk…").fill("Enjoy watching Josh Allen, son")
    dad.get_by_label("Send").click()
    shot(dad, "09_chat")
    dad.get_by_label("Close").last.click()
    shot(dad, "10_dad_home_locked")

    # Game goes final → auto-settle via the real server job code
    out = subprocess.run(["node", "test/e2e_server.mjs", "settle"], capture_output=True, text=True)
    print(out.stdout[-900:], out.stderr[-500:])
    assert "SETTLE OK" in out.stdout
    assert balance("Dad") == 125 and balance("Mo") == 225, (balance("Dad"), balance("Mo"))
    dad.reload(); dad.wait_for_timeout(1200); shot(dad, "11_dad_won")

    # Dad cashes out $50; Mo sees it in The Bank
    tab(dad, "Locker"); dad.get_by_text("Cash Out", exact=True).click()
    dad.get_by_role("button", name="$50").click()
    dad.get_by_placeholder("@your-venmo").fill("@dad-venmo")
    dad.get_by_role("button", name="Request $50 cash out").click()
    expect(dad.get_by_text("Cash out requested")).to_be_visible()
    assert balance("Dad") == 75
    mo.reload(); tab(mo, "Locker"); mo.get_by_text("The Bank (Admin)").click()
    expect(mo.get_by_text("CASH-OUTS TO SEND (1)")).to_be_visible(); shot(mo, "12_bank_cashout")
    mo.get_by_role("button", name="✓ Paid").click(); mo.wait_for_timeout(700)
    assert sql("select status from withdrawal_requests") == "paid"
    mo.get_by_label("Close").click()
    tab(mo, "Home"); shot(mo, "13_mo_home")
    dad.reload(); tab(dad, "Locker"); dad.get_by_text("Wallet & Transactions").click(); shot(dad, "14_wallet")

    total = int(sql("select coalesce(sum(amount),0) from ledger"))
    in_bets = int(sql("select coalesce(sum(amount * case when status='locked' then 2 else 1 end),0) from wagers where status in ('pending','locked')"))
    print("books:", total, "+", in_bets, "=", total + in_bets, "(deposits 350 + adj 50 - paid 50 = 350)")
    assert total + in_bets == 350
    print("UI E2E PASSED")
    b.close()
