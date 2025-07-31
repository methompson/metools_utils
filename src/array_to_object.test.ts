import {
  arrayToGroup,
  arrayToObject,
  mappedArrayToGroup,
  mappedArrayToObject,
} from './array_to_object';

describe('array_to_object', () => {
  describe('arrayToObject', () => {
    test('converts number arrays to objects', () => {
      const numInput = [1, 2, 3, 4];

      const map = arrayToObject(numInput, (num) => num);

      expect(map[1]).toBe(1);
      expect(map[2]).toBe(2);
      expect(map[3]).toBe(3);
      expect(map[4]).toBe(4);
    });

    test('converts string arrays to objects', () => {
      const strInput = ['1', '2', '3', '4'];

      const map = arrayToObject(strInput, (str) => str);

      expect(map['1']).toBe('1');
      expect(map['2']).toBe('2');
      expect(map['3']).toBe('3');
      expect(map['4']).toBe('4');
    });

    test('complex data structures can also be used with any value', () => {
      class MyTestClass {
        id: string;

        constructor(public name: string) {
          this.id = `${Math.random()}`;
        }
      }

      const tc1 = new MyTestClass('name 1');
      const tc2 = new MyTestClass('name 2');
      const tc3 = new MyTestClass('name 3');
      const tc4 = new MyTestClass('name 4');

      const map1 = arrayToObject([tc1, tc2, tc3, tc4], (c) => c.id);

      expect(map1[tc1.id]).toBe(tc1);
      expect(map1[tc2.id]).toBe(tc2);
      expect(map1[tc3.id]).toBe(tc3);
      expect(map1[tc4.id]).toBe(tc4);

      const map2 = arrayToObject([tc1, tc2, tc3, tc4], (c) => c.name);

      expect(map2[tc1.name]).toBe(tc1);
      expect(map2[tc2.name]).toBe(tc2);
      expect(map2[tc3.name]).toBe(tc3);
      expect(map2[tc4.name]).toBe(tc4);
    });
  });

  describe('arrayToGroup', () => {
    test('converts number arrays to objects with arrays as values', () => {
      const numInput = [1, 2, 3, 4];

      const map = arrayToGroup(numInput, (num) => num);

      expect(map[1]).toEqual([1]);
      expect(map[2]).toEqual([2]);
      expect(map[3]).toEqual([3]);
      expect(map[4]).toEqual([4]);
    });

    test('converts string arrays to objects with arrays as values', () => {
      const strInput = ['1', '2', '3', '4'];

      const map = arrayToGroup(strInput, (str) => str);

      expect(map['1']).toEqual(['1']);
      expect(map['2']).toEqual(['2']);
      expect(map['3']).toEqual(['3']);
      expect(map['4']).toEqual(['4']);
    });

    test('complex data structures can also be used with any value', () => {
      class MyTestClass {
        id: string;

        constructor(public name: string) {
          this.id = `${Math.random()}`;
        }
      }

      const tc1 = new MyTestClass('name 1');
      const tc2 = new MyTestClass('name 2');
      const tc3 = new MyTestClass('name 3');
      const tc4 = new MyTestClass('name 4');

      const map1 = arrayToGroup([tc1, tc2, tc3, tc4], (c) => c.id);

      expect(map1[tc1.id]).toEqual([tc1]);
      expect(map1[tc2.id]).toEqual([tc2]);
      expect(map1[tc3.id]).toEqual([tc3]);
      expect(map1[tc4.id]).toEqual([tc4]);

      const map2 = arrayToGroup([tc1, tc2, tc3, tc4], (c) => c.name);

      expect(map2[tc1.name]).toEqual([tc1]);
      expect(map2[tc2.name]).toEqual([tc2]);
      expect(map2[tc3.name]).toEqual([tc3]);
      expect(map2[tc4.name]).toEqual([tc4]);
    });

    test('moves several objects with similar attributes to the same group', () => {
      const obj1 = { id: '1', type: 'a' };
      const obj2 = { id: '2', type: 'a' };
      const obj3 = { id: '3', type: 'b' };
      const obj4 = { id: '4', type: 'b' };

      const map = arrayToGroup([obj1, obj2, obj3, obj4], (obj) => obj.type);

      expect(map.a).toEqual([obj1, obj2]);
      expect(map.b).toEqual([obj3, obj4]);
    });
  });

  describe('mappedArrayToObject', () => {
    test('converts array of objects to objects with a mapped value', () => {
      const input = [
        { id: 1, name: 'name 1' },
        { id: 2, name: 'name 2' },
        { id: 3, name: 'name 3' },
        { id: 4, name: 'name 4' },
      ];

      const map = mappedArrayToObject(
        input,
        (obj) => obj.id,
        (obj) => obj.name,
      );

      expect(map[1]).toBe('name 1');
      expect(map[2]).toBe('name 2');
      expect(map[3]).toBe('name 3');
      expect(map[4]).toBe('name 4');
    });

    test('converts array of objects to objects with a value with string key', () => {
      const input = [
        { id: 'square', value: 1 },
        { id: 'circle', value: 2 },
        { id: 'triangle', value: 3 },
        { id: 'star', value: 4 },
      ];
      const map = mappedArrayToObject(
        input,
        (obj) => obj.id,
        (obj) => obj.value,
      );
      expect(map.square).toBe(1);
      expect(map.circle).toBe(2);
      expect(map.triangle).toBe(3);
      expect(map.star).toBe(4);
    });
  });

  describe('mappedArrayToGroup', () => {
    test('converts array of objects and groups them together', () => {
      const obj1 = { id: '1', type: 'a' };
      const obj2 = { id: '2', type: 'a' };
      const obj3 = { id: '3', type: 'b' };
      const obj4 = { id: '4', type: 'b' };

      const map = mappedArrayToGroup(
        [obj1, obj2, obj3, obj4],
        (obj) => obj.type,
        (obj) => ({
          id: obj.id,
          type: obj.type,
          combo: `${obj.id}-${obj.type}`,
        }),
      );

      expect(map.a).toEqual([
        {
          id: '1',
          type: 'a',
          combo: '1-a',
        },
        {
          id: '2',
          type: 'a',
          combo: '2-a',
        },
      ]);
      expect(map.b).toEqual([
        {
          id: '3',
          type: 'b',
          combo: '3-b',
        },
        {
          id: '4',
          type: 'b',
          combo: '4-b',
        },
      ]);
    });
  });
});
