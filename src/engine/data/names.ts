/**
 * Name pools per nationality. Common surnames only, deliberately avoiding well-known hockey names;
 * first and last names are combined randomly.
 */

export interface NationPool {
  code: string;
  label: string;
  weight: number;
  first: string[];
  last: string[];
}

export const NATIONS: NationPool[] = [
  {
    code: 'CAN',
    label: 'Kanada',
    weight: 40,
    first: ['Liam', 'Owen', 'Carter', 'Brayden', 'Tyler', 'Connor', 'Dylan', 'Logan', 'Ethan', 'Nolan', 'Cole', 'Jordan', 'Mason', 'Riley', 'Evan', 'Brett', 'Shane', 'Mathieu', 'Alexis', 'Félix', 'Gabriel', 'Jacob', 'Hunter', 'Quinn', 'Cameron', 'Kyle', 'Travis', 'Jared', 'Mitchell', 'Wyatt'],
    last: ['MacLeod', 'Tremblay', 'Gagnon', 'Fraser', 'Campbell', 'Robertson', 'Pelletier', 'Morin', 'Sinclair', 'McAllister', 'Lalonde', 'Harrington', 'Kowalchuk', 'Stewart', 'Dawson', 'Gauthier', 'Lavoie', 'McKenna', 'Thibault', 'Ouellet', 'Prentice', 'Archambault', 'Beaulieu', 'Whitfield', 'Paquette', 'Holloway', 'Sutherland', 'Ferland-Côté', 'Cormier', 'Hebert', 'Laroche', 'Desrosiers', 'Gallant', 'McIsaac', 'Cheverie', 'Boudreau-Lamy', 'Lapointe', 'Rideout', 'Arsenault', 'Matheson'],
  },
  {
    code: 'USA',
    label: 'USA',
    weight: 28,
    first: ['Jack', 'Brady', 'Tanner', 'Cade', 'Luke', 'Matt', 'Zach', 'Trevor', 'Austin', 'Chase', 'Kevin', 'Drew', 'Ryan', 'Nick', 'Sean', 'Brock', 'Colin', 'Jake', 'Grant', 'Parker', 'Cooper', 'Henry', 'Will', 'Charlie', 'Sam', 'Ben', 'Ty', 'Garrett'],
    last: ['Sullivan', 'Callahan', 'Kowalski', 'Brennan', 'Peterson', 'Donovan', 'Mancini', 'Fitzgerald', 'Reilly', 'Hendricks', 'Walsh', 'McCarthy', 'Bennett', 'Duffy', 'Schneider', 'Galloway', 'Pruitt', 'Keegan', 'Hollister', 'Rourke', 'Whitman', 'Sorensen', 'Bishop', 'Conway', 'Delgado', 'Fenwick', 'Garrity', 'Halvorsen', 'Kerrigan', 'Lindell', 'Maddox', 'Oakes', 'Prescott'],
  },
  {
    code: 'SWE',
    label: 'Schweden',
    weight: 8,
    first: ['Erik', 'Oskar', 'Viktor', 'Elias', 'Filip', 'Gustav', 'Isak', 'Hampus', 'Linus', 'Rasmus', 'Albin', 'Jesper', 'Anton', 'Lucas', 'Emil', 'Melker'],
    last: ['Lindqvist', 'Bergström', 'Sandberg', 'Holmgren', 'Wallin', 'Nyberg', 'Sjöberg', 'Engström', 'Dahlgren', 'Hedlund', 'Åkesson', 'Norrby', 'Strand', 'Hallander', 'Westerlund', 'Ljungberg', 'Österlund', 'Rydén'],
  },
  {
    code: 'FIN',
    label: 'Finnland',
    weight: 5,
    first: ['Aleksi', 'Eetu', 'Joonas', 'Juuso', 'Kasperi', 'Lauri', 'Mikko', 'Niko', 'Otto', 'Roope', 'Ville', 'Henri', 'Arttu', 'Sami'],
    last: ['Korhonen', 'Mäkinen', 'Virtanen', 'Lehtonen', 'Nieminen', 'Salonen', 'Laaksonen', 'Hakala', 'Kivelä', 'Peltonen', 'Saarinen', 'Tuominen', 'Heikkilä', 'Väisänen'],
  },
  {
    code: 'RUS',
    label: 'Russland',
    weight: 6,
    first: ['Artyom', 'Dmitri', 'Ilya', 'Kirill', 'Maxim', 'Nikita', 'Pavel', 'Vladislav', 'Yegor', 'Sergei', 'Andrei', 'Mikhail', 'Denis', 'Roman'],
    last: ['Volkov', 'Morozov', 'Sokolov', 'Kuzmin', 'Lebedev', 'Belov', 'Zaitsev', 'Gusev', 'Karpov', 'Smirnov', 'Tikhonov', 'Yakovlev', 'Danilov', 'Shirokov', 'Malyshev'],
  },
  {
    code: 'CZE',
    label: 'Tschechien',
    weight: 4,
    first: ['Jakub', 'Ondřej', 'Tomáš', 'Matěj', 'Filip', 'David', 'Lukáš', 'Radek', 'Vojtěch', 'Martin'],
    last: ['Novotný', 'Dvořák', 'Procházka', 'Kučera', 'Horák', 'Veselý', 'Svoboda', 'Černý', 'Pokorný', 'Hájek', 'Bláha'],
  },
  {
    code: 'SVK',
    label: 'Slowakei',
    weight: 2,
    first: ['Marek', 'Juraj', 'Šimon', 'Adam', 'Patrik', 'Samuel', 'Michal'],
    last: ['Hudák', 'Kováč', 'Baláž', 'Gajdoš', 'Mikuš', 'Ondrejka', 'Hrnčiar'],
  },
  {
    code: 'GER',
    label: 'Deutschland',
    weight: 2,
    first: ['Leon', 'Moritz', 'Lukas', 'Jonas', 'Tim', 'Nico', 'Maximilian', 'Felix'],
    last: ['Hoffmann', 'Brandt', 'Krämer', 'Seidel', 'Wagner', 'Lindner', 'Vogt', 'Kühn', 'Maas'],
  },
  {
    code: 'SUI',
    label: 'Schweiz',
    weight: 2,
    first: ['Nino', 'Janis', 'Dario', 'Kevin', 'Sven', 'Luca', 'Noah'],
    last: ['Meier', 'Brunner', 'Graf', 'Moser', 'Arnold', 'Bachmann', 'Frehner'],
  },
  {
    code: 'LAT',
    label: 'Lettland',
    weight: 1,
    first: ['Kristaps', 'Rūdolfs', 'Elvis', 'Mārtiņš', 'Teodors'],
    last: ['Bērziņš', 'Kalniņš', 'Ozoliņš', 'Lūsis', 'Ziedonis'],
  },
  {
    code: 'DEN',
    label: 'Dänemark',
    weight: 1,
    first: ['Mads', 'Frederik', 'Mikkel', 'Oliver', 'Magnus'],
    last: ['Jensen', 'Nielsen', 'Madsen', 'Bjerrum', 'Lauridsen'],
  },
  {
    code: 'NOR',
    label: 'Norwegen',
    weight: 0.5,
    first: ['Mats', 'Sondre', 'Eirik', 'Henrik'],
    last: ['Olsen', 'Haugen', 'Thoresen', 'Bakke'],
  },
  {
    code: 'AUT',
    label: 'Österreich',
    weight: 0.5,
    first: ['Thomas', 'Marco', 'Benjamin', 'Paul'],
    last: ['Huber', 'Kogler', 'Steiner', 'Pichler'],
  },
];

export const GM_FIRST = ['Bill', 'Doug', 'Ken', 'Ron', 'Pierre', 'Lou', 'Kyle', 'Julien', 'Chris', 'Marc', 'Steve', 'Brian', 'Kelly', 'Jim', 'Don', 'Patrik', 'Kent', 'Ray', 'Dale', 'Mike', 'Tom', 'Pat', 'Glen', 'Jeff', 'Dana'];
export const GM_LAST = ['Hollis', 'Laporte', 'Fenton', 'Whitcombe', 'Garneau', 'Ashby', 'Kilbride', 'Renaud', 'Stockwell', 'Merriman', 'Danforth', 'Pomeroy', 'Lachance', 'Brightman', 'Vachon-Dale', 'Oberg', 'Calloway', 'Hartigan', 'Thorne', 'Mulgrew', 'Pickard', 'Beausoleil', 'Grieve', 'Kendrick', 'Ainsley'];
