/**
 * Five-letter entries barred from being the English ANSWER.
 *
 * They stay perfectly valid GUESSES — this only stops them being the word of
 * the day. The English list is frequency-ranked, and common first names, place
 * names and brands clear that bar easily: a sample of 120 dailies served CONGO,
 * COLIN, HENRY, MARIA, HOMER, DIANE, FEDEX and WELSH, which is roughly one
 * unguessable word a fortnight.
 *
 * Only unambiguous proper nouns belong here. CANON, DELTA, LANCE, AMBER, GRACE
 * and the like read as ordinary words first and are deliberately left in.
 */
export const EN_NOT_ANSWERS: ReadonlySet<string> = new Set([
  // Given names
  'COLIN', 'HENRY', 'MARIA', 'HOMER', 'DIANE', 'SUSAN', 'JAMES', 'DAVID', 'PETER',
  'SARAH', 'LINDA', 'KAREN', 'NANCY', 'BETTY', 'HELEN', 'DONNA', 'CAROL', 'JULIE',
  'JOYCE', 'DORIS', 'FRANK', 'LARRY', 'SCOTT', 'BRIAN', 'KEVIN', 'JASON', 'JERRY',
  'ROGER', 'WAYNE', 'RALPH', 'LOUIS', 'BOBBY', 'TOMMY', 'BILLY', 'JIMMY', 'DANNY',
  'RANDY', 'TERRY', 'JESSE', 'MARIO', 'LUCAS', 'ETHAN', 'CHLOE', 'EMILY', 'MEGAN',
  'LAURA', 'DEBRA', 'JANET', 'KELLY', 'TRACY', 'WENDY', 'IRENE', 'EDITH', 'ALICE',
  'ROSIE', 'MOLLY', 'SALLY', 'KATIE', 'JACOB', 'JULIA', 'MARIE', 'ANGEL', 'CRAIG',
  'KEITH', 'SHAWN', 'DEREK', 'TODAY', 'ELLEN', 'JOANN', 'LEWIS', 'BRUCE', 'CHRIS',
  'STEVE', 'GLENN', 'GRANT', 'HARRY', 'JOHNS', 'SIMON', 'TONYA', 'VICKI', 'ROBIN',
  // Places
  'CONGO', 'CHINA', 'JAPAN', 'INDIA', 'KENYA', 'EGYPT', 'CHILE', 'SPAIN', 'ITALY',
  'WALES', 'WELSH', 'TEXAS', 'MAINE', 'TULSA', 'PARIS', 'TOKYO', 'SEOUL', 'CAIRO',
  'MILAN', 'DELHI', 'DUBAI', 'LAGOS', 'ACCRA', 'DAKAR', 'HANOI', 'OSAKA', 'KYOTO',
  'PERTH', 'MIAMI', 'OMAHA', 'SALEM', 'NEPAL', 'SUDAN', 'SYRIA', 'LIBYA', 'MALTA',
  'CRETE', 'RHINE', 'ANDES', 'TIBET', 'SEINE', 'IRAQI', 'SAUDI', 'CUBAN', 'SWISS',
  'DUTCH', 'IRISH', 'ASIAN', 'ROMAN', 'GREEK', 'LATIN', 'ARABS', 'TEXAN', 'BOISE',
  // Brands and the like
  'FEDEX', 'XEROX', 'NIKON', 'HONDA', 'MAZDA', 'LEXUS', 'TESLA', 'INTEL', 'ADOBE',
  'CISCO', 'NOKIA', 'PEPSI', 'KODAK', 'YAHOO', 'SKYPE', 'EBAYS', 'LINUX', 'MYSQL',
  'IPODS', 'XBOXS', 'AMEEX', 'EXCEL', 'WORDS',
]);
