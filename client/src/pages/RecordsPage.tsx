import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Calendar, Clock, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface DailySession {
  id: number;
  sessionDate: string;
  totalDurationSeconds: number;
  sessionCount: number;
  averageAngle: string;
  createdAt: string;
  updatedAt: string;
}

interface MeasurementRecord {
  id: number;
  angle: string;
  durationSeconds: number;
  sessionDate: string;
  sessionTime: string;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}분 ${remainingSeconds}초`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function formatTime24(timeStr: string): string {
  if (!timeStr) return '--:--';
  const [hours, minutes] = timeStr.split(':');
  return `${hours}:${minutes}`;
}

function SessionDetails({ date, isOpen }: { date: string; isOpen: boolean }) {
  const { data: records, isLoading } = useQuery({
    queryKey: ['/api/records/details', date],
    enabled: isOpen
  });

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="pl-6 py-2 text-sm text-gray-500">
        세부 세션 로딩 중...
      </div>
    );
  }

  if (!records || records.length === 0) {
    return (
      <div className="pl-6 py-2 text-sm text-gray-500">
        세부 세션 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="pl-6 space-y-2 py-2 border-l-2 border-gray-100">
      <div className="text-xs font-medium text-gray-600 mb-2">세부 세션</div>
      {records.map((record: MeasurementRecord) => (
        <div key={record.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="font-medium">{formatTime24(record.sessionTime)}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-blue-600 font-medium">{record.angle}도</span>
            <span className="text-gray-600">{formatTime(record.durationSeconds)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RecordsPage() {
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  
  const { data: sessions, isLoading, error } = useQuery({
    queryKey: ['/api/records/history']
  });

  const toggleSession = (date: string) => {
    const newExpanded = new Set(expandedSessions);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedSessions(newExpanded);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-500">기록을 불러오는 중...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-red-500">
              기록을 불러오는 중 오류가 발생했습니다.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            중력이완요법 날짜별 세션
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!sessions || sessions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              아직 기록된 세션이 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-4 gap-4 py-3 px-4 bg-gray-100 rounded-lg text-sm font-medium text-gray-700">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  날짜 / 시작시간
                </div>
                <div className="text-center">실사용 평균각도</div>
                <div className="text-center">총 세션 시간</div>
                <div className="text-center">세션 수</div>
              </div>

              {/* Sessions */}
              {sessions.map((session: DailySession) => {
                const isExpanded = expandedSessions.has(session.sessionDate);
                return (
                  <Collapsible key={session.id} open={isExpanded}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full justify-start hover:bg-gray-50 p-0"
                        onClick={() => toggleSession(session.sessionDate)}
                      >
                        <div className="grid grid-cols-4 gap-4 py-3 px-4 w-full text-left">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                            <span className="font-medium">{formatDate(session.sessionDate)}</span>
                          </div>
                          <div className="text-center text-blue-600 font-medium">
                            {session.averageAngle}도
                          </div>
                          <div className="text-center">
                            {formatTime(session.totalDurationSeconds)}
                          </div>
                          <div className="text-center text-gray-600">
                            {session.sessionCount}회
                          </div>
                        </div>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SessionDetails 
                        date={session.sessionDate} 
                        isOpen={isExpanded}
                      />
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}