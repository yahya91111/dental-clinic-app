import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { scale } from '../../lib/scale';
import { LinearGradient } from 'expo-linear-gradient';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKS_PER_PAGE = 5;
const TOTAL_PAGES = 53; // ~1 year worth of pages
const CENTER_PAGE = Math.floor(TOTAL_PAGES / 2); // start in the middle

interface WeekStripProps {
  selectedWeekStart: Date;
  onSelectWeek: (weekStart: Date) => void;
}

function getCurrentSunday(): Date {
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekForPage(pageIndex: number, weekIndex: number): Date {
  const currentSunday = getCurrentSunday();
  const offset = (pageIndex - CENTER_PAGE) * WEEKS_PER_PAGE + weekIndex;
  const week = new Date(currentSunday);
  week.setDate(currentSunday.getDate() + (offset * 7));
  return week;
}

function isSameWeek(a: Date, b: Date): boolean {
  const aStart = new Date(a);
  aStart.setDate(aStart.getDate() - aStart.getDay());
  aStart.setHours(0, 0, 0, 0);
  const bStart = new Date(b);
  bStart.setDate(bStart.getDate() - bStart.getDay());
  bStart.setHours(0, 0, 0, 0);
  return aStart.getTime() === bStart.getTime();
}

function isCurrentWeek(date: Date): boolean {
  return isSameWeek(date, new Date());
}

function getPageLabel(pageIndex: number): string {
  const firstWeek = getWeekForPage(pageIndex, 0);
  const lastWeek = getWeekForPage(pageIndex, WEEKS_PER_PAGE - 1);
  const sameMonth = firstWeek.getMonth() === lastWeek.getMonth();
  return sameMonth
    ? `${MONTHS[firstWeek.getMonth()]} ${firstWeek.getFullYear()}`
    : `${MONTHS[firstWeek.getMonth()]} - ${MONTHS[lastWeek.getMonth()]} ${lastWeek.getFullYear()}`;
}

export function WeekStrip({ selectedWeekStart, onSelectWeek }: WeekStripProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(CENTER_PAGE);
  const pageWidth = SCREEN_WIDTH;

  // Scroll to center page on mount
  React.useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        x: CENTER_PAGE * pageWidth,
        animated: false,
      });
    }, 50);
  }, []);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    if (page !== currentPage) {
      setCurrentPage(page);
    }
  };

  const goToCurrentWeek = () => {
    onSelectWeek(getCurrentSunday());
    scrollRef.current?.scrollTo({
      x: CENTER_PAGE * pageWidth,
      animated: true,
    });
    setCurrentPage(CENTER_PAGE);
  };

  return (
    <View style={{
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderBottomWidth: scale(1),
      borderBottomColor: 'rgba(0,0,0,0.06)',
      paddingBottom: scale(10),
      paddingTop: scale(4),
    }}>
      {/* Paging ScrollView */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        decelerationRate="fast"
      >
        {Array.from({ length: TOTAL_PAGES }, (_, pageIndex) => (
          <View
            key={pageIndex}
            style={{
              width: pageWidth,
              flexDirection: 'row',
              paddingHorizontal: scale(8),
              gap: scale(4),
            }}
          >
            {Array.from({ length: WEEKS_PER_PAGE }, (_, weekIndex) => {
              const week = getWeekForPage(pageIndex, weekIndex);
              const isSelected = isSameWeek(week, selectedWeekStart);
              const isCurrent = isCurrentWeek(week);
              const thursday = new Date(week);
              thursday.setDate(week.getDate() + 4);

              return (
                <TouchableOpacity
                  key={weekIndex}
                  onPress={() => onSelectWeek(week)}
                  activeOpacity={0.7}
                  style={{
                    flex: 1,
                    borderRadius: scale(12),
                    overflow: 'hidden',
                    borderWidth: isSelected ? scale(2) : scale(1.5),
                    borderColor: isSelected
                      ? 'rgba(50, 80, 140, 0.5)'
                      : isCurrent
                        ? 'rgba(71,118,186,0.3)'
                        : 'rgba(255,255,255,0.5)',
                  }}
                >
                  <LinearGradient
                    colors={isSelected
                      ? ['rgba(50,80,150,0.6)', 'rgba(90,130,200,0.4)', 'rgba(90,130,200,0.4)', 'rgba(50,80,150,0.6)']
                      : isCurrent
                        ? ['rgba(71,118,186,0.2)', 'rgba(120,160,210,0.12)', 'rgba(120,160,210,0.12)', 'rgba(71,118,186,0.2)']
                        : ['rgba(71,118,186,0.1)', 'rgba(120,160,210,0.06)', 'rgba(120,160,210,0.06)', 'rgba(71,118,186,0.1)']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={{
                      paddingVertical: scale(8),
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{
                      fontSize: scale(13),
                      fontWeight: '700',
                      color: isSelected ? '#FFFFFF' : '#3B5998',
                      textShadowColor: isSelected ? 'rgba(30,50,100,0.5)' : 'transparent',
                      textShadowOffset: { width: 0, height: scale(0.5) },
                      textShadowRadius: scale(1),
                    }}>
                      {week.getDate()}
                    </Text>
                    <Text style={{
                      fontSize: scale(9),
                      fontWeight: '600',
                      color: isSelected ? 'rgba(255,255,255,0.85)' : '#718096',
                      marginTop: scale(1),
                    }}>
                      {MONTHS[week.getMonth()]}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
