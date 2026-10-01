import {
  buildTranscriptContent,
  fetchYoutubeTranscript,
  parseCaptionXml,
  pickCaptionTrack,
  youtubeVideoId,
} from '../youtubeTranscript';

describe('youtubeVideoId', () => {
  test.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=10', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('%s', (url, id) => {
    expect(youtubeVideoId(url)).toBe(id);
  });

  test('rejects non-video links', () => {
    expect(youtubeVideoId('https://www.youtube.com/')).toBeNull();
    expect(youtubeVideoId('https://www.youtube.com/@channel')).toBeNull();
    expect(youtubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeVideoId('https://notyoutube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeVideoId('')).toBeNull();
    expect(youtubeVideoId(null)).toBeNull();
  });
});

describe('parseCaptionXml', () => {
  test('legacy <text> format with entities', () => {
    const xml = '<transcript><text start="0" dur="1">Hello &amp; welcome</text><text start="1" dur="2">it&amp;#39;s   me\n</text></transcript>';
    expect(parseCaptionXml(xml)).toBe('Hello & welcome it\'s me');
  });
  test('srv3 <p><s> format', () => {
    const xml = '<timedtext><body><p t="0" d="1"><s>Hello</s><s> there</s></p><p t="1" d="1">a &lt;b&gt; c</p></body></timedtext>';
    expect(parseCaptionXml(xml)).toBe('Hello there a <b> c');
  });
  test('empty', () => {
    expect(parseCaptionXml('<transcript></transcript>')).toBe('');
  });
});

describe('pickCaptionTrack', () => {
  const tracks = [
    { languageCode: 'de', baseUrl: 'de' },
    { languageCode: 'en', kind: 'asr', baseUrl: 'en-asr' },
    { languageCode: 'en-GB', baseUrl: 'en-gb' },
  ];
  test('human over asr for the same language', () => {
    expect(pickCaptionTrack(tracks, ['en'])?.baseUrl).toBe('en-gb');
  });
  test('earlier preferred language wins', () => {
    expect(pickCaptionTrack(tracks, ['de', 'en'])?.baseUrl).toBe('de');
  });
  test('falls back to something when nothing matches', () => {
    expect(pickCaptionTrack([{ languageCode: 'ja', baseUrl: 'ja' }], ['en'])?.baseUrl).toBe('ja');
    expect(pickCaptionTrack([], ['en'])).toBeNull();
  });
});

describe('buildTranscriptContent', () => {
  test('matches core metadata header', () => {
    expect(buildTranscriptContent({
      transcript: 'words',
      metadata: { title: 'T', author: 'A', description: '', viewCount: '10' },
    })).toBe('<title>T</title><author>A</author><view_count>10</view_count>\nTranscript:\nwords');
  });
  test('no metadata returns the transcript as is', () => {
    expect(buildTranscriptContent({
      transcript: 'words',
      metadata: { title: '', author: '', description: '', viewCount: '' },
    })).toBe('words');
  });
});

describe('fetchYoutubeTranscript', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  const respond = (body: string | object, status = 200) => Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response);

  test('watch page -> player -> captions', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn((url: string) => {
      calls.push(url);
      if (url.includes('/watch?')) return respond('..."INNERTUBE_API_KEY":"KEY123"...');
      if (url.includes('/youtubei/v1/player')) return respond({
        playabilityStatus: { status: 'OK' },
        captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ languageCode: 'en', baseUrl: 'https://www.youtube.com/api/timedtext?v=x&fmt=srv3&lang=en' }] } },
        videoDetails: { title: 'Title', author: 'Author', shortDescription: 'Desc', viewCount: '42' },
      });
      return respond('<transcript><text start="0" dur="1">hi there</text></transcript>');
    }) as any;

    const result = await fetchYoutubeTranscript('https://youtu.be/dQw4w9WgXcQ');
    expect(result).toEqual({
      videoId: 'dQw4w9WgXcQ',
      transcript: 'hi there',
      metadata: { title: 'Title', author: 'Author', description: 'Desc', viewCount: '42' },
    });
    expect(calls[1]).toBe('https://www.youtube.com/youtubei/v1/player?key=KEY123');
    expect(calls[2]).toBe('https://www.youtube.com/api/timedtext?v=x&lang=en');
  });

  test('playable video without captions reports disabled', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/watch?')) return respond('"INNERTUBE_API_KEY":"KEY"');
      return respond({ playabilityStatus: { status: 'OK' } });
    }) as any;
    await expect(fetchYoutubeTranscript('https://youtu.be/dQw4w9WgXcQ')).rejects.toThrow('Transcripts are disabled');
  });

  test('recaptcha page reports rate limiting', async () => {
    global.fetch = jest.fn(() => respond('<div class="g-recaptcha"></div>')) as any;
    await expect(fetchYoutubeTranscript('https://youtu.be/dQw4w9WgXcQ')).rejects.toThrow('rate limiting');
  });
});
