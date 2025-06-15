import { View } from "react-native";

export default function ProgressBars({ numberOfBars = 4, activeBar = 1 }) {
    return (
        <View className='flex flex-row overflow-scroll w-full items-center justify-center gap-x-4'>
            {Array.from({ length: numberOfBars }).map((_, index) => (
                <View key={index} className={`w-[60px] h-[8px] ${index < activeBar ? 'bg-[--cta-blue-progress-bar]' : 'bg-gray-500'} rounded-full`} />
            ))}
        </View>
    )
}