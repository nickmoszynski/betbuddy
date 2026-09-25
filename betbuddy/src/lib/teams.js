// Team badge colors + abbreviations (pro leagues). College teams fall back
// to a generated badge. Format: "Full Name|ABBR|primary|accent"
const RAW = `
Arizona Cardinals|ARI|#97233F|#FFB612
Atlanta Falcons|ATL|#A71930|#FFFFFF
Baltimore Ravens|BAL|#241773|#9E7C0C
Buffalo Bills|BUF|#00338D|#C60C30
Carolina Panthers|CAR|#0085CA|#BFC0BF
Chicago Bears|CHI|#0B162A|#C83803
Cincinnati Bengals|CIN|#FB4F14|#000000
Cleveland Browns|CLE|#311D00|#FF3C00
Dallas Cowboys|DAL|#003594|#869397
Denver Broncos|DEN|#FB4F14|#002244
Detroit Lions|DET|#0076B6|#B0B7BC
Green Bay Packers|GB|#203731|#FFB612
Houston Texans|HOU|#03202F|#A71930
Indianapolis Colts|IND|#002C5F|#A2AAAD
Jacksonville Jaguars|JAX|#006778|#D7A22A
Kansas City Chiefs|KC|#E31837|#FFB81C
Las Vegas Raiders|LV|#000000|#A5ACAF
Los Angeles Chargers|LAC|#0080C6|#FFC20E
Los Angeles Rams|LAR|#003594|#FFA300
Miami Dolphins|MIA|#008E97|#FC4C02
Minnesota Vikings|MIN|#4F2683|#FFC62F
New England Patriots|NE|#002244|#C60C30
New Orleans Saints|NO|#101820|#D3BC8D
New York Giants|NYG|#0B2265|#A71930
New York Jets|NYJ|#125740|#FFFFFF
Philadelphia Eagles|PHI|#004C54|#A5ACAF
Pittsburgh Steelers|PIT|#101820|#FFB612
San Francisco 49ers|SF|#AA0000|#B3995D
Seattle Seahawks|SEA|#002244|#69BE28
Tampa Bay Buccaneers|TB|#D50A0A|#B1BABF
Tennessee Titans|TEN|#0C2340|#4B92DB
Washington Commanders|WAS|#5A1414|#FFB612
Atlanta Hawks|ATL|#E03A3E|#C1D32F
Boston Celtics|BOS|#007A33|#BA9653
Brooklyn Nets|BKN|#000000|#FFFFFF
Charlotte Hornets|CHA|#1D1160|#00788C
Chicago Bulls|CHI|#CE1141|#FFFFFF
Cleveland Cavaliers|CLE|#860038|#FDBB30
Dallas Mavericks|DAL|#00538C|#B8C4CA
Denver Nuggets|DEN|#0E2240|#FEC524
Detroit Pistons|DET|#C8102E|#1D42BA
Golden State Warriors|GSW|#1D428A|#FFC72C
Houston Rockets|HOU|#CE1141|#FFFFFF
Indiana Pacers|IND|#002D62|#FDBB30
Los Angeles Clippers|LAC|#C8102E|#1D428A
Los Angeles Lakers|LAL|#552583|#FDB927
Memphis Grizzlies|MEM|#5D76A9|#F5B112
Miami Heat|MIA|#98002E|#F9A01B
Milwaukee Bucks|MIL|#00471B|#EEE1C6
Minnesota Timberwolves|MIN|#0C2340|#78BE20
New Orleans Pelicans|NOP|#0C2340|#C8102E
New York Knicks|NYK|#006BB6|#F58426
Oklahoma City Thunder|OKC|#007AC1|#EF3B24
Orlando Magic|ORL|#0077C0|#C4CED4
Philadelphia 76ers|PHI|#006BB6|#ED174C
Phoenix Suns|PHX|#1D1160|#E56020
Portland Trail Blazers|POR|#E03A3E|#FFFFFF
Sacramento Kings|SAC|#5A2D81|#63727A
San Antonio Spurs|SAS|#000000|#C4CED4
Toronto Raptors|TOR|#CE1141|#FFFFFF
Utah Jazz|UTA|#002B5C|#F9A01B
Washington Wizards|WAS|#002B5C|#E31837
Arizona Diamondbacks|ARI|#A71930|#E3D4AD
Athletics|ATH|#003831|#EFB21E
Oakland Athletics|OAK|#003831|#EFB21E
Atlanta Braves|ATL|#CE1141|#13274F
Baltimore Orioles|BAL|#DF4601|#000000
Boston Red Sox|BOS|#BD3039|#FFFFFF
Chicago Cubs|CHC|#0E3386|#CC3433
Chicago White Sox|CWS|#27251F|#C4CED4
Cincinnati Reds|CIN|#C6011F|#FFFFFF
Cleveland Guardians|CLE|#00385D|#E50022
Colorado Rockies|COL|#333366|#C4CED4
Detroit Tigers|DET|#0C2340|#FA4616
Houston Astros|HOU|#002D62|#EB6E1F
Kansas City Royals|KC|#004687|#BD9B60
Los Angeles Angels|LAA|#BA0021|#FFFFFF
Los Angeles Dodgers|LAD|#005A9C|#EF3E42
Miami Marlins|MIA|#00A3E0|#EF3340
Milwaukee Brewers|MIL|#12284B|#FFC52F
Minnesota Twins|MIN|#002B5C|#D31145
New York Mets|NYM|#002D72|#FF5910
New York Yankees|NYY|#003087|#FFFFFF
Philadelphia Phillies|PHI|#E81828|#FFFFFF
Pittsburgh Pirates|PIT|#27251F|#FDB827
San Diego Padres|SD|#2F241D|#FFC425
San Francisco Giants|SF|#FD5A1E|#27251F
Seattle Mariners|SEA|#0C2C56|#005C5C
St. Louis Cardinals|STL|#C41E3A|#FFFFFF
St Louis Cardinals|STL|#C41E3A|#FFFFFF
Tampa Bay Rays|TB|#092C5C|#8FBCE6
Texas Rangers|TEX|#003278|#C0111F
Toronto Blue Jays|TOR|#134A8E|#FFFFFF
Washington Nationals|WSH|#AB0003|#FFFFFF
Anaheim Ducks|ANA|#F47A38|#B9975B
Boston Bruins|BOS|#FFB81C|#000000
Buffalo Sabres|BUF|#002654|#FCB514
Calgary Flames|CGY|#C8102E|#F1BE48
Carolina Hurricanes|CAR|#CE1126|#FFFFFF
Chicago Blackhawks|CHI|#CF0A2C|#FFFFFF
Colorado Avalanche|COL|#6F263D|#236192
Columbus Blue Jackets|CBJ|#002654|#CE1126
Dallas Stars|DAL|#006847|#8F8F8C
Detroit Red Wings|DET|#CE1126|#FFFFFF
Edmonton Oilers|EDM|#041E42|#FF4C00
Florida Panthers|FLA|#041E42|#C8102E
Los Angeles Kings|LAK|#111111|#A2AAAD
Minnesota Wild|MIN|#154734|#A6192E
Montréal Canadiens|MTL|#AF1E2D|#FFFFFF
Montreal Canadiens|MTL|#AF1E2D|#FFFFFF
Nashville Predators|NSH|#FFB81C|#041E42
New Jersey Devils|NJD|#CE1126|#000000
New York Islanders|NYI|#00539B|#F47D30
New York Rangers|NYR|#0038A8|#CE1126
Ottawa Senators|OTT|#C52032|#C2912C
Philadelphia Flyers|PHI|#F74902|#000000
Pittsburgh Penguins|PIT|#000000|#FCB514
San Jose Sharks|SJS|#006D75|#EA7200
Seattle Kraken|SEA|#001628|#99D9D9
St Louis Blues|STL|#002F87|#FCB514
St. Louis Blues|STL|#002F87|#FCB514
Tampa Bay Lightning|TBL|#002868|#FFFFFF
Toronto Maple Leafs|TOR|#00205B|#FFFFFF
Utah Hockey Club|UTA|#71AFE5|#000000
Utah Mammoth|UTA|#71AFE5|#000000
Vancouver Canucks|VAN|#00205B|#00843D
Vegas Golden Knights|VGK|#B4975A|#333F42
Washington Capitals|WSH|#C8102E|#041E42
Winnipeg Jets|WPG|#041E42|#AC162C
`;

export const TEAM_DATA = Object.fromEntries(
  RAW.trim().split("\n").map((l) => {
    const [name, abbr, color, alt] = l.split("|");
    return [name, { abbr, color, alt }];
  })
);

const PALETTE = ["#1D428A", "#8B1E3F", "#0B6E4F", "#5B2A86", "#9C4A00", "#00507A", "#7A1F1F", "#2F4858", "#6B4E16", "#23395B"];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export const normName = (t = "") => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const LEAGUE = { NFL: "nfl", NBA: "nba", NCAAF: "college-football", NCAAB: "mens-college-basketball" };
let REG = {};            // name_key → { short, abbr, color, logo }
let RANKS = {};          // league → { name_key → rank }
export function setTeams(rows = []) {
  const reg = {}, ranks = {};
  for (const r of rows) {
    const cur = reg[r.name_key];
    if (!cur || (!cur.logo && r.logo)) reg[r.name_key] = { short: r.short_name, abbr: r.abbr, color: r.color, logo: r.logo };
    if (r.rank) (ranks[r.league] ||= {})[r.name_key] = r.rank;
  }
  REG = reg; RANKS = ranks;
}
export const teamInfo = (name = "") => REG[normName(name)];
export const rankOf = (sport, name) => RANKS[LEAGUE[sport]]?.[normName(name)] || null;
export const hasRankings = (sport) => Object.keys(RANKS[LEAGUE[sport]] || {}).length > 0;

export function getTeam(name = "") {
  const info = REG[normName(name)];
  if (info) {
    const fb = TEAM_DATA[name];
    return { abbr: info.abbr || fb?.abbr || "?", color: info.color || fb?.color || PALETTE[hash(name) % PALETTE.length], alt: fb?.alt || "#FFFFFF", logo: info.logo };
  }
  if (TEAM_DATA[name]) return TEAM_DATA[name];
  // College / unknown: school name initials, e.g. "Ohio State Buckeyes" → "OSU"-ish
  const words = name.replace(/[^A-Za-z&' ]/g, "").split(" ").filter(Boolean);
  const school = words.length > 1 ? words.slice(0, -1) : words;
  let abbr = school.length === 1 ? school[0].slice(0, 4).toUpperCase() : school.map((w) => w[0]).join("").slice(0, 4).toUpperCase();
  if (!abbr) abbr = "?";
  return { abbr, color: PALETTE[hash(name) % PALETTE.length], alt: "#FFFFFF" };
}
