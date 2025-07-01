export type ILocation = {
    country: string;
    countryCode: string;
    region: string;
    regionName: string;
    city: string;
    zip: string;
    lat: number;
    lon: number;
    timezone: string;
    asn: string;
    query: string;
}

export default {
    id: 'getLocation',
    name: 'Get Location',
    description: 'Get your approximate location. This will return the city, state, and country. ',
    defaultEnabled: true,
    category: 'default',
    definition: {
        type: 'function',
        function: {
            name: 'get_location',
            description: 'Get the approximate location of the user.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
    config: {},
    execute: async function () {
        try {
            const location = await this._getLocation();
            if (!location) return 'Approximated location not able to be determined';
            return JSON.stringify({ city: location?.city, state: location?.regionName, country: location?.country });
        } catch (error) {
            console.log('getLocationTool', error);
            return 'Error getting location';
        }
    },
    _getLocation: async function (): Promise<ILocation | null> {
        try {
            const location = await fetch('https://geojson.anythingllm.com');
            const data = await location.json();
            return data;
        } catch (error) {
            console.log('_getLocation', error);
            return null;
        }
    }
} as const;