import { influenceSemaphore, marginSemaphore } from './semaphore';

describe('influenceSemaphore', () => {
  it('is green from 50%', () => {
    expect(influenceSemaphore(50)).toBe('green');
    expect(influenceSemaphore(72.4)).toBe('green');
  });

  it('is yellow from 40,0% to 49,9%', () => {
    expect(influenceSemaphore(49.9)).toBe('yellow');
    expect(influenceSemaphore(40)).toBe('yellow');
  });

  it('is red below 40%', () => {
    expect(influenceSemaphore(39.9)).toBe('red');
    expect(influenceSemaphore(4.1)).toBe('red');
  });

  it('judges the value as shown, rounded to one decimal', () => {
    expect(influenceSemaphore(49.97)).toBe('green');
    expect(influenceSemaphore(39.94)).toBe('red');
  });
});

describe('marginSemaphore', () => {
  it('is green from 30 points, yellow from 18, red below', () => {
    expect(marginSemaphore(30)).toBe('green');
    expect(marginSemaphore(29.9)).toBe('yellow');
    expect(marginSemaphore(18)).toBe('yellow');
    expect(marginSemaphore(17.9)).toBe('red');
    expect(marginSemaphore(0)).toBe('red');
  });
});
