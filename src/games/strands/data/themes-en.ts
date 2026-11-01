import type { StrandsTheme } from '../types';

/**
 * English theme pools.
 *
 * Each theme offers far more words than one board needs. The level builder
 * picks a subset whose lengths sum to exactly the 48 cells left after the
 * spangram, so a generous pool with varied lengths is what makes a theme
 * usable — and it lets one theme produce many different boards.
 *
 * Spangrams must be at least 6 letters (the board's narrow side) and are
 * written here with their spaces; the grid stores them closed up.
 */
export const EN_THEMES: ReadonlyArray<StrandsTheme> = [
  {
    id: 'fruit',
    clue: 'Fruit bowl',
    spangram: 'FRUIT SALAD',
    words: ['APPLE', 'GRAPE', 'LEMON', 'MANGO', 'PEACH', 'MELON', 'CHERRY', 'BANANA',
      'ORANGE', 'PAPAYA', 'APRICOT', 'AVOCADO', 'PEAR', 'PLUM', 'LIME', 'KIWI', 'DATE'],
  },
  {
    id: 'farm',
    clue: 'Down on the farm',
    spangram: 'BARNYARD',
    words: ['HORSE', 'SHEEP', 'GOOSE', 'GOAT', 'DUCK', 'PIGLET', 'CHICKEN', 'TRACTOR',
      'ROOSTER', 'DONKEY', 'TURKEY', 'RABBIT', 'STABLE', 'FIELD', 'FENCE', 'HARVEST'],
  },
  {
    id: 'kitchen',
    clue: 'Pulled from the drawer',
    spangram: 'POTS AND PANS',
    words: ['WHISK', 'LADLE', 'SPOON', 'KNIFE', 'PLATE', 'KETTLE', 'SKILLET', 'GRATER',
      'TOASTER', 'BLENDER', 'SPATULA', 'COLANDER', 'OVEN', 'BOWL', 'FORK', 'SIEVE'],
  },
  {
    id: 'weather',
    clue: "Look at today's sky",
    spangram: 'FORECAST',
    words: ['CLOUD', 'STORM', 'FROST', 'SLEET', 'HAIL', 'WIND', 'SNOW', 'RAIN', 'MIST',
      'THUNDER', 'RAINBOW', 'DRIZZLE', 'SUNSHINE', 'BLIZZARD', 'HUMIDITY', 'BREEZE'],
  },
  {
    id: 'bigcats',
    clue: 'Not your lap companion',
    spangram: 'BIG CATS',
    words: ['TIGER', 'LIONESS', 'CHEETAH', 'LEOPARD', 'JAGUAR', 'COUGAR', 'OCELOT',
      'PANTHER', 'BOBCAT', 'CARACAL', 'LYNX', 'PUMA', 'TIGRESS'],
  },
  {
    id: 'sports',
    clue: 'Pick your side',
    spangram: 'TEAM SPIRIT',
    words: ['SOCCER', 'HOCKEY', 'RUGBY', 'TENNIS', 'CRICKET', 'BASEBALL', 'NETBALL',
      'HANDBALL', 'CURLING', 'ROWING', 'POLO', 'BOWLS', 'SQUASH', 'FENCING'],
  },
  {
    id: 'instruments',
    clue: 'Tune up before the downbeat',
    spangram: 'ORCHESTRA',
    words: ['VIOLIN', 'CELLO', 'FLUTE', 'OBOE', 'HARP', 'DRUMS', 'PIANO', 'TRUMPET',
      'CLARINET', 'TROMBONE', 'BASSOON', 'PICCOLO', 'GUITAR', 'VIOLA', 'TUBA'],
  },
  {
    id: 'ocean',
    clue: 'Below the waterline',
    spangram: 'DEEP BLUE SEA',
    words: ['WHALE', 'SHARK', 'CORAL', 'SQUID', 'OTTER', 'DOLPHIN', 'OCTOPUS', 'LOBSTER',
      'MACKEREL', 'STINGRAY', 'URCHIN', 'MUSSEL', 'CRAB', 'KELP', 'TUNA', 'SEAL'],
  },
  {
    id: 'breakfast',
    clue: 'First meal of the day',
    spangram: 'MORNING MEAL',
    words: ['TOAST', 'BACON', 'BAGEL', 'JUICE', 'HONEY', 'CEREAL', 'MUFFIN', 'OMELETTE',
      'PANCAKE', 'PORRIDGE', 'WAFFLE', 'YOGURT', 'EGGS', 'JAM', 'OATS', 'COFFEE'],
  },
  {
    id: 'tools',
    clue: 'Found in the shed',
    spangram: 'TOOLBOX',
    words: ['HAMMER', 'WRENCH', 'PLIERS', 'CHISEL', 'SPANNER', 'SCREWDRIVER', 'DRILL',
      'SANDER', 'MALLET', 'RULER', 'LEVEL', 'CLAMP', 'SAW', 'FILE', 'VICE', 'AWL'],
  },
  {
    id: 'trees',
    clue: 'Rings tell their age',
    spangram: 'WOODLAND',
    words: ['BIRCH', 'MAPLE', 'CEDAR', 'ALDER', 'ASPEN', 'WILLOW', 'POPLAR', 'WALNUT',
      'CHESTNUT', 'SYCAMORE', 'JUNIPER', 'SPRUCE', 'OAK', 'ELM', 'PINE', 'YEW'],
  },
  {
    id: 'birds',
    clue: 'Dawn chorus',
    spangram: 'BIRDSONG',
    words: ['ROBIN', 'FINCH', 'RAVEN', 'HERON', 'EAGLE', 'FALCON', 'MAGPIE', 'SPARROW',
      'STARLING', 'KINGFISHER', 'SWALLOW', 'CUCKOO', 'WREN', 'OWL', 'DOVE', 'SWAN'],
  },
  {
    id: 'desserts',
    clue: 'Save room for these',
    spangram: 'SWEET TOOTH',
    words: ['TRIFLE', 'SORBET', 'MOUSSE', 'GATEAU', 'STRUDEL', 'BROWNIE', 'PUDDING',
      'MERINGUE', 'TIRAMISU', 'CUSTARD', 'PARFAIT', 'TART', 'CAKE', 'PIE', 'FUDGE'],
  },
  {
    id: 'space',
    clue: 'Look up on a clear night',
    spangram: 'OUTER SPACE',
    words: ['COMET', 'ORBIT', 'LUNAR', 'SOLAR', 'PLANET', 'GALAXY', 'METEOR', 'NEBULA',
      'ASTEROID', 'ECLIPSE', 'SATURN', 'VENUS', 'MARS', 'STAR', 'MOON', 'SUN'],
  },
  {
    id: 'clothes',
    clue: 'Getting dressed',
    spangram: 'WARDROBE',
    words: ['SHIRT', 'SKIRT', 'JEANS', 'SCARF', 'BLOUSE', 'JACKET', 'JUMPER', 'TROUSERS',
      'CARDIGAN', 'WAISTCOAT', 'SANDALS', 'GLOVES', 'COAT', 'SOCK', 'HAT', 'BOOTS'],
  },
  {
    id: 'colours',
    clue: 'Open the paint box',
    spangram: 'COLOUR CHART',
    words: ['AMBER', 'IVORY', 'OLIVE', 'CORAL', 'BEIGE', 'INDIGO', 'VIOLET', 'MAROON',
      'SCARLET', 'LAVENDER', 'TURQUOISE', 'CRIMSON', 'TEAL', 'LIME', 'GOLD', 'PLUM'],
  },
  {
    id: 'bakery',
    clue: 'That smell at the counter',
    spangram: 'FRESH BREAD',
    words: ['SCONE', 'LOAF', 'ROLL', 'BUN', 'CROISSANT', 'BAGUETTE', 'CIABATTA',
      'PRETZEL', 'DOUGH', 'CRUST', 'YEAST', 'FLOUR', 'PASTRY', 'BRIOCHE', 'MUFFIN'],
  },
  {
    id: 'garden',
    clue: 'Out among the beds',
    spangram: 'GREEN FINGERS',
    words: ['TULIP', 'DAISY', 'PANSY', 'LILAC', 'POPPY', 'ORCHID', 'DAHLIA', 'PETUNIA',
      'LAVENDER', 'SUNFLOWER', 'COMPOST', 'TROWEL', 'SEED', 'LAWN', 'HEDGE', 'ROSE'],
  },
  {
    id: 'camping',
    clue: 'A night under canvas',
    spangram: 'CAMPSITE',
    words: ['TENT', 'ROPE', 'TORCH', 'STOVE', 'MATCH', 'KETTLE', 'MALLET', 'LANTERN',
      'RUCKSACK', 'SLEEPING', 'FIREWOOD', 'COMPASS', 'MAP', 'PEGS', 'BOOTS', 'FLASK'],
  },
  {
    id: 'desk',
    clue: 'Within arm\u2019s reach at work',
    spangram: 'OFFICE DESK',
    words: ['STAPLER', 'PENCIL', 'ERASER', 'FOLDER', 'RULER', 'MARKER', 'NOTEPAD',
      'KEYBOARD', 'MONITOR', 'SCISSORS', 'CLIPBOARD', 'DIARY', 'PEN', 'CLIP', 'TAPE'],
  },
  {
    id: 'castle',
    clue: 'Raise the drawbridge',
    spangram: 'STRONGHOLD',
    words: ['TOWER', 'MOAT', 'KEEP', 'GATE', 'TURRET', 'RAMPART', 'DUNGEON', 'BATTLEMENT',
      'PORTCULLIS', 'COURTYARD', 'ARCHER', 'KNIGHT', 'ARMOUR', 'BANNER', 'WALL'],
  },
  {
    id: 'cycling',
    clue: 'Two wheels and a hill',
    spangram: 'BICYCLE RIDE',
    words: ['PEDAL', 'CHAIN', 'BRAKE', 'SPOKE', 'SADDLE', 'HELMET', 'GEARS', 'HANDLEBAR',
      'PUNCTURE', 'MUDGUARD', 'PANNIER', 'TYRE', 'WHEEL', 'FRAME', 'PUMP', 'LIGHT'],
  },
  {
    id: 'cold',
    clue: 'Wrap up warm',
    spangram: 'DEEP FREEZE',
    words: ['GLACIER', 'ICICLE', 'TUNDRA', 'SHIVER', 'MITTENS', 'SNOWMAN', 'TOBOGGAN',
      'AVALANCHE', 'PENGUIN', 'IGLOO', 'SKATE', 'CHILL', 'ICE', 'SNOW', 'FROST'],
  },
  {
    id: 'theatre',
    clue: 'Curtain up',
    spangram: 'ON THE STAGE',
    words: ['ACTOR', 'SCENE', 'SCRIPT', 'COSTUME', 'CURTAIN', 'AUDIENCE', 'REHEARSAL',
      'SPOTLIGHT', 'INTERVAL', 'BALCONY', 'USHER', 'PROPS', 'CAST', 'ROLE', 'WINGS'],
  },
];
