import { NativeModules } from 'react-native';
const { WebScraperModule } = NativeModules;

interface NativeWebScraper {
    scrape(url: string): Promise<WebScraperResult>;
}

export interface WebScraperResult {
    title: string;
    content: string;
    url: string;
}

class WebScraperInstance {
    private static instance: WebScraperInstance;
    // @ts-ignore-next-line
    private webScraper: NativeWebScraper;

    constructor() {
        if (WebScraperInstance.instance) return WebScraperInstance.instance;
        this.webScraper = WebScraperModule;
        WebScraperInstance.instance = this;
    }

    private validatedUrl(url: string): string | null {
        try {
            let validUrl = url;
            const protocolRegex = /^(https|http):\/\//i;
            if (!protocolRegex.test(validUrl)) validUrl = `https://${validUrl}`;
            new URL(validUrl);
            return validUrl;
        } catch (e) {
            return null;
        }
    }


    /**
     * Scrape a website and return the TEXT content. (document.body.innerText)
     */
    async scrape(url: string): Promise<WebScraperResult> {
        const validatedUrl = this.validatedUrl(url);
        if (!validatedUrl) throw new Error('Invalid URL');
        return this.webScraper.scrape(validatedUrl);
    }
}

export default new WebScraperInstance();