/**
 * 课堂页（服务端外壳）
 *
 * 在服务器端读取章节 + 老师 persona，把数据直接传给客户端组件。
 */

import { notFound } from 'next/navigation';
import { getChapter } from '@/lib/wulian/agents/chapter';
import { getPersona } from '@/lib/wulian/agents/persona';
import { LessonRoom } from '../../components/LessonRoom';

export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const chapter = await getChapter(id);
  if (!chapter) return notFound();
  const teacher = await getPersona(chapter.primaryScientist);
  if (!teacher) return notFound();
  const secondary = chapter.secondaryScientist
    ? await getPersona(chapter.secondaryScientist)
    : null;

  return <LessonRoom chapter={chapter} teacher={teacher} secondary={secondary} />;
}
