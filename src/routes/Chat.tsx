import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { streamChat, downloadFile } from '../lib/api';
import { useUIStore } from '../lib/stores';
import { useModels, useSession } from '../hooks/useSession';
import { timeAgo, formatTokens, type Message } from '../lib/types';
import ModelPicker from '../components/chat/ModelPicker';
import { Markdown, CopyButton } from '../components/Markdown';

interface LocalMsg extends Message {
  streaming?: boolean;
}

export default function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setSidebar } = useUIStore();
  const { data: modelsData } = useModels();
  const { session } = useSession();

  const defaultModel = modelsData?.default_model ?? 'openai/gpt-4o-mini';
  const [model, setModel] = useState(defaultModel);
  useEffect(() => setModel(defaultModel), [defaultModel]);

  const [input, setInput] = useState('');
  const [images, setImages] = useState<string[]>([]); // data URLs
  const [fileMeta, setFileMeta] = useState<{ name: string; mime: string; size: number; path?: string }[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // ---- Load conversation + messages ----
  const { data: conv } = useQuery({
    queryKey: ['conversation', conversationId],
    enable: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // model derived from conversation hint when switching chats (only on conversation change)
  const appliedHintRef = useRef<string | null>(null);
  useEffect(() => {
    if (conversationId && conv?.model_hint && appliedHintRef.current !== conversationId) {
      appliedHintRef.current = conversationId;
      setModel(conv.model_hint);
    }
  }, [conversationId, conv?.model_hint]);

  const { data: allMessages = [] } = useQuery({
    queryKey: ['messages', conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as Message[];
    },
  });

  // active branch path (walk from leaf to root)
  const msgMap = useMemo(() => {
    const m = new Map<string, Message>();
    allMessages.forEach((msg) => m.set(msg.id, msg));
    return m;
  }, [allMessages]);

  const [leafId, setLeafId] = useState<string | null>(null);

  const path = useMemo<Message[]>(() => {
    if (!allMessages.length) return [];
    // default leaf: the last message by created_at that is a leaf (no children)
    const childrenOf = new Set(allMessages.map((m) =>>m.parent_message_id).filter(Boolean));
    let leaf = leafId;
    if (!leaf || !msgMap.has(leaf)) {
      leaf = allMessages
        .filter((m) => !childrenOf.has(m.id))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.id ?? null;
    }
    const out: Message[] = [];
    let cur = leaf ? msgMap.get(leaf) : undefined;
    let guard = 0;
    while (cur && guard < 50) {
      guard++;
      out.unshift(cur);
      cur = cur.parent_message_id ? msgMap.get(cur.parent_message_id) : undefined;
    }
    return out;
  }, [allMessages, leafId, msgMap]);

  // local streaming message appended to path
  const [streamMsg, setStreamMsg] = useState<LocalMsg | null>(null);
  const display = streamMsg ? [...path, streamMsg] : path;

  // reset leaf when conversation changes
  useEffect(() => {
    setLeafId(null);
    setStreamMsg(null);
    setError('');
  }, [conversationId]);

  // autoscroll
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [display.length, streamMsg?.content]);

  // ---- Send ----
  const send = useCallback(
    async (opts?: { content?: string; parentId?: string | null }) => {
      setError('');
      const text = (opts?.content ?? input).trim();
      if (!text) return;
      if (streaming) return;

      // parent for the new user message
      const parentId = opts?.parentId ?? path[path.length - 1]?.id ?? null;

      const payload: Parameters<typeof streamChat>[0] = {
        // continue the current conversation if we're inside one (/chat/:id)
        conversation_id: conversationId || undefined,
        model,
        content: text,
        parent_message_id: parentId,
        attachments: fileMeta,
        images,
      };

      {
        // optimistic: add a local user message so the UI updates immediately
        const optimistic: LocalMsg = {
          id: 'local-' + Date.now(),,
          conversation_id: conversationId ?? '',
          user_id: session!.user.id,
          parent_message_id: parentId,
          role: 'user',
          content: text,
          attachments: fileMeta,
          model: null,
          tokens_in: null,
          tokens_out: null,
          cost_usd: null,
          created_at: new Date().toISOString(),
        };
        setStreamMsg(optimistic);
        setInput('');
        setImages([]);
        setFileMeta([]);
      }

      // assistant streaming placeholder
      const aId = 'local-a-' + Date.now();
      setStreaming(true);
      const placeholder: LocalMsg = {
          id: aId,
          conversation_id: conversationId ?? '',
          user_id: session!.user.id,
          parent_message_id: parentId,
          role: 'assistant',
          content: '',
          attachments: [],
          model,
       Fö¶Vç5ö–ã¢çVÆÂÀ¢Fö¶Vç5ö÷WC¢çVÆÂÀ¢6÷7E÷W6C¢çVÆÂÀ¢7&VFVEöC¢æWrFFR‚’çFô•4õ7G&–ær‚’À¢7G&VÖ–æs¢G'VRÀ¢Ó° ¢G'’°¢v—B7G&VÔ6†B‡–ÆöBÂ°¢öäÖWF¢†ÖWF’Óâ°¢–b‚6öçfW'6F–öä–BbbÖWFæ6öçfW'6F–öåö–B’°¢æf–vFR†ö6†BòG¶ÖWFæ6öçfW'6F–öåö–GÖÂ²&WÆ6S¢G'VRÒ“°¢Ğ¢òòföÆB÷F–Ö—7F–2W6W"×6r–çFò7G&VÔ×6r†76—7FçB¢6WE7G&VÔ×6r‡²ââçÆ6V†öÆFW"Â–C¢ÖWFæÖW76vUö–BÇÂ–BÂÖöFVÃ¢ÖWFæÖöFVÂÒ“°¢ÒÀ¢öäFVÇF¢†B’Óâ°¢6WE7G&VÔ×6r‚‡&Wb’Óâ‡&Wbò²ââç&WbÂ6öçFVçC¢&Wbæ6öçFVçB²BÒ¢&Wb’“°¢ÒÀ¢öäW'&÷#¢†×6r’Óâ°¢6WDW'&÷"†×6r“°¢6WE7G&VÔ×6r†çVÆÂ“°¢ÒÀ¢öäFöæS¢‚’Óâ°¢6WE7G&VÔ×6r†çVÆÂ“°¢2æ–çfÆ–FFUVW&–W2‡²VW'”¶W“¢²vÖW76vW2rÂ6öçfW'6F–öä–EÒÒ“°¢2æ–çfÆ–FFUVW&–W2‡²VW'”¶W“¢²v6öçfW'6F–öç2uÒÒ“°¢2æ–çfÆ–FFUVW&–W2‡²VW'”¶W“¢²v6öçfW'6F–öârÂ6öçfW'6F–öä–EÒÒ“°¢2æ–çfÆ–FFUVW&–W2‡²VW'”¶W“¢²wW6vR×F÷FÇ2uÒÒ“°¢ÒÀ¢Ò“°¢Ò6F6‚†W'#¢ç’’°¢6WDW'&÷"†W'#òæÖW76vRÇÂtf–ÆVBFò6VæBr“°¢6WE7G&VÔ×6r†çVÆÂ“°¢Òf–æÆÇ’°¢6WE7G&VÖ–ær†fÇ6R“°¢&÷'E&Vbæ7W'&VçBÒçVÆÃ°¢Ğ¢ÒÀ¢¶–çWBÂ7G&VÖ–ærÂÖöFVÂÂf–ÆTÖWFÂ–ÖvW2ÂF‚Â6öçfW'6F–öä–BÂ6W76–öâÂæf–vFRÂ5Ğ¢“° ¢6öç7B7F÷Ò‚’Óâ°¢&÷'E&Vbæ7W'&VçCòæ&÷'B‚“°¢6WE7G&VÖ–ær†fÇ6R“°¢6WE7G&VÔ×6r†çVÆÂ“°¢Ó° ¢òòÒÒÒÒf–ÆRò–ÖvR†æFÆ–ærÒÒÒĞ¢6öç7Böäf–ÆW2Ò7–æ2†f–ÆW3¢f–ÆTÆ—7B’Óâ°¢f÷"†6öç7Bf–ÆRöb'&’æg&öÒ†f–ÆW2’’°¢–b†f–ÆRç6—¦Râ#R¢#B¢#B’°¢6WDW'&÷"†G¶f–ÆRææÖWÒW†6VVG2#TÔ&“°¢6öçF–çVS°¢Ğ¢–b†f–ÆRçG—Rç7F'G5v—F‚‚v–ÖvRòr’bbf–ÆRç6—¦RÃÒB¢#B¢#B’°¢6öç7B&VFW"ÒæWrf–ÆU&VFW"‚“°¢&VFW"æöæÆöBÒ‚’Óâ6WD–ÖvW2‚‡&Wb’Óâ²ââç&WbÂ&VFW"ç&W7VÇB27G&–æuÒ“°¢&VFW"ç&VD4FFU$Â†f–ÆR“°¢ÒVÇ6R°¢òòæöâÖ–ÖvS¢WÆöBFò7F÷&vS²6öçFVçB–çFVÆÆ–vVæ6R'&—fW2–â†6R ¢6öç7BF‚ÒG·6W76–öâçW6W"æ–GÒòG¶7'—Fòç&æFöÕUT”B‚—Ö°¢6öç7B²W'&÷"ÒÒv—B7W&6Rç7F÷&vRæg&öÒ‚wW6W"Öf–ÆW2r’çWÆöB‡F‚Âf–ÆR“°¢–b†W'&÷"’°¢6WDW'&÷"†WÆöBf–ÆVC¢G¶W'&÷"æÖW76vWÖ“°¢ÒVÇ6R°¢6WDf–ÆTÖWF‚‡&Wb’Óâ²ââç&WbÂ²æÖS¢f–ÆRææÖRÂÖ–ÖS¢f–ÆRçG—RÂ6—¦S¢f–ÆRç6—¦RÂF‚ÕÒ“°¢Ğ¢Ğ¢Ğ¢Ó° ¢òòÒÒÒÒ6öçfW'6F–öâ7F–öç2ÒÒÒĞ¢6öç7BWFFT6öçbÒ7–æ2‡F6ƒ¢&V6÷&CÇ7G&–ærÂVæ¶æ÷vãâ’Óâ°¢–b‚6öçfW'6F–öä–B’&WGW&ã°¢v—B7W&6Ræg&öÒ‚v6öçfW'6F–öç2r’çWFFR‡F6‚’æW‚v–BrÂ6öçfW'6F–öä–B“°¢2æ–çfÆ–FFUVW&–W2‡²VW'”¶W“¢²v6öçfW'6F–öârÂ6öçfW'6F–öä–EÒÒ“°¢2æ–çfÆ–FFUVW&–W2‡²VW'”¶W“¢²v6öçfW'6F–öç2uÒÒ“°¢Ó° ¢6öç7BFVÆWFT6öçbÒ7–æ2‚’Óâ°¢–b‚6öçfW'6F–öä–BÇÂ6öæf—&Ò‚tFVÆWFRF†—26öçfW'6F–öãòF†—26ææ÷B&RVæFöæRâr’’&WGW&ã°¢v—B7W&6Ræg&öÒ‚v6öçfW'6F–öç2r’æFVÆWFR‚’æW‚v–BrÂ6öçfW'6F–öä–B“°¢2æ–çfÆ–FFUVW&–W2‡²VW'”¶W“¢²v6öçfW'6F–öç2uÒÒ“°¢æf–vFR‚rö6†Br“°¢Ó° ¢6öç7BW‡÷'D6†BÒ‚’Óâ°¢6öç7B÷WBÒ°¢F—FÆS¢6öçcòçF—FÆRÀ¢ÖöFVÂÀ¢W‡÷'FVEöC¢æWrFFR‚’çFô•4õ7G&–ær‚’À¢ÖW76vW3¢F—7Æ’æÖ‚†Ò’Óâ‡²&öÆS¢Òç&öÆRÂ6öçFVçC¢Òæ6öçFVçBÂÖöFVÃ¢ÒæÖöFVÂÒ’’À¢Ó°¢F÷væÆöDf–ÆR†G²†6öçcòçF—FÆRÇÂv6†Br’ç&WÆ6R‚õµæ×£Ó•Ò²öv’ÂrÒr—Òæ§6öæÂ¥4ôâç7G&–æv–g’†÷WBÂçVÆÂÂ"’“°¢Ó° ¢6öç7B&VæÖRÒ7–æ2‚’Óâ°¢6öç7BF—FÆRÒ&ö×B‚t6öçfW'6F–öâF—FÆRrÂ6öçcòçF—FÆR“°¢–b‡F—FÆR’v—BWFFT6öçb‡²F—FÆRÒ“°¢Ó° ¢6öç7B¶VF—F–æt–BÂ6WDVF—F–æt–EÒÒW6U7FFSÇ7G&–ærÂçVÆÃâ†çVÆÂ“°¢6öç7B'&æ6„g&öÒÒ†×6s¢ÖW76vR’Óâ°¢6WDÆVd–B†×6rç&VçEöÖW76vUö–Bóò×6ræ–B“°¢6WD–çWB†×6rç&öÆRÓÓÒwW6W"rò×6ræ6öçFVçB¢rr“°¢6WE7G&VÔ×6r†çVÆÂ“°¢Ó° ¢òò&VvVæW&FS¢&R×6VæBF†RÆ7BW6W"ÖW76vR26–&Æ–ær'&æ6€¢6öç7B&VvVæW&FRÒ‚’Óâ°¢6öç7BÆ7EW6W"Ò²ââæF—7Æ•Òç&WfW'6R‚’æf–æB‚†Ò’ÓâÒç&öÆRÓÓÒwW6W"r“°¢–b‚Æ7EW6W"’&WGW&ã°¢6VæB‡²6öçFVçC¢Æ7EW6W"æ6öçFVçBÂ&VçD–C¢Æ7EW6W"ç&VçEöÖW76vUö–BóòçVÆÂÒ“°¢Ó° ¢&WGW&â€¢ÆF—b6Æ74æÖSÒ&fÆW‚‚ÖgVÆÂfÆW‚Ö6öÂ#à¢²ò¢F÷&"¢÷Ğ¢Æ†VFW"6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ"&÷&FW"Ö"&÷&FW"×7W&f6RÓ#‚Ó2’Ó"F&³¦&÷&FW"×7W&f6RÓƒ#à¢Æ'WGFöâöä6Æ–6³×²‚’Óâ6WE6–FV&"‡G'VR—Ò6Æ74æÖSÒ&–6öâÖ'FâÖC¦†–FFVâ"&–ÖÆ&VÃÒ$÷Vâ6–FV&"#î)‹Âö'WGFöãà¢Æ'WGFöâöä6Æ–6³×·&VæÖWÒ6Æ74æÖSÒ&Ö–â×rÓfÆW‚ÓG'Væ6FRFW‡BÖÆVgBFW‡B×6ÒföçBÖÖVF—VÒ†÷fW#§FW‡BÖ66VçBÓc"F—FÆSÒ%&VæÖR#à¢¶6öçcòçF—FÆRÇÂtæWr6öçfW'6F–öâwĞ¢Âö'WGFöãà¢¶6öçbbb€¢Æ'WGFöà¢öä6Æ–6³×²‚’ÓâWFFT6öçb‡²–ææVC¢6öçbç–ææVBÒ—Ğ¢6Æ74æÖS×¶–6öâÖ'FâG¶6öçbç–ææVBòwFW‡BÖ66VçBÓSr¢rwÖĞ¢F—FÆSÒ%–â ¢à¢)ˆP¢Âö'WGFöãà¢—Ğ¢ÄÖöFVÅ–6¶W"fÇVS×¶ÖöFVÇÒöä6†ævS×·6WDÖöFVÇÒóà¢Æ'WGFöâöä6Æ–6³×¶W‡÷'D6†GÒ6Æ74æÖSÒ&–6öâÖ'Fâ"F—FÆSÒ$W‡÷'B#î*I3Âö'WGFöãà¢¶6öçbbb€¢Æ'WGFöà¢öä6Æ–6³×²‚’ÓâWFFT6öçb‡²&6†—fVC¢6öçbæ&6†—fVB×Ğ¢6Æ74æÖSÒ&–6öâÖ'Fâ ¢F—FÆS×¶6öçbæ&6†—fVBòuVæ&6†—fRr¢t&6†—fRwĞ¢óà¢	ùx@¢Âö'WGFöãà¢—Ğ¢¶6öçbbbÆ'WGFöâöä6Æ–6³×¶FVÆWFT6öçgÒ6Æ74æÖSÒ&–6öâÖ'Fâ"F—FÆSÒ$FVÆWFR#ï	ùyÂö'WGFöãçĞ¢Âö†VFW#à ¢²ò¢ÖW76vW2¢÷Ğ¢ÆF—b&Vc×·67&öÆÅ&VgÒ6Æ74æÖSÒ&fÆW‚Ó÷fW&fÆ÷r×’ÖWFò#à¢ÆF—b6Æ74æÖSÒ&×‚ÖWFòÖ‚×rÓ7†Â‚ÓB’Ób#à¢¶F—7Æ’æÆVæwF‚ÓÓÒbbÄV×G•7FFRó÷Ğ¢¶F—7Æ’æÖ‚†ÒÂ’’Óâ€¢ÄÖW76vT'V&&ÆP¢¶W“×¶Òæ–GĞ¢×6s×¶×Ğ¢—4Æ7C×¶’ÓÓÒF—7Æ’æÆVæwF‚ÒĞ¢7G&VÖ–æs×²†Ò2Æö6Ä×6r’ç7G&VÖ–æwĞ¢öä'&æ6ƒ×²‚’Óâ'&æ6„g&öÒ†Ò—Ğ¢öå&VvVæW&FS×¶’ÓÓÒF—7Æ’æÆVæwF‚Òò&VvVæW&FR¢VæFVf–æVGĞ¢óà¢’—Ğ¢¶W'&÷"bb€¢ÆF—b6Æ74æÖSÒ&×BÓB&÷VæFVB×†Â&÷&FW"&÷&FW"×&VBÓ3óC&r×&VBÓSó‚ÓB’Ó2FW‡B×6ÒFW‡B×&VBÓcF&³§FW‡B×&VBÓC#à¢¶W'&÷'Ğ¢ÂöF—cà¢—Ğ¢ÂöF—cà¢ÂöF—cà ¢²ò¢6ö×÷6W"¢÷Ğ¢ÆF—b6Æ74æÖSÒ&&÷&FW"×B&÷&FW"×7W&f6RÓ#&r×7W&f6RÓS‚ÓB’Ó2F&³¦&÷&FW"×7W&f6RÓƒF&³¦&r×7W&f6RÓ“#à¢ÆF—b6Æ74æÖSÒ&×‚ÖWFòÖ‚×rÓ7†Â#à¢¶–ÖvW2æÆVæwF‚âbb€¢ÆF—b6Æ74æÖSÒ&Ö"Ó"fÆW‚fÆW‚×w&vÓ"#à¢¶–ÖvW2æÖ‚‡7&2Â’’Óâ€¢ÆF—b¶W“×¶—Ò6Æ74æÖSÒ'&VÆF—fR#à¢Æ–Ör7&3×·7&7ÒÇCÒ""6Æ74æÖSÒ&‚ÓbrÓb&÷VæFVBÖÆrö&¦V7BÖ6÷fW""óà¢Æ'WGFöà¢öä6Æ–6³×²‚’Ò6WD–ÖvW2‚‡’Óâæf–ÇFW"‚…òÂ¢’Óâ¢ÓÒ’’—Ğ¢6Æ74æÖSÒ&'6öÇWFR×&–v‡BÓãR×F÷ÓãRfÆW‚‚ÓRrÓR—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖgVÆÂ&r×7W&f6RÓ“FW‡B×‡2FW‡B×v†—FR ¢à¢)ÉP¢Âö'WGFöãà¢ÂöF—cà¢’—Ğ¢ÂöF—cà¢—Ğ¢¶f–ÆTÖWFæÆVæwF‚âbb€¢ÆF—b6Æ74æÖSÒ&Ö"Ó"fÆW‚fÆW‚×w&vÓ"#à¢¶f–ÆTÖWFæÖ‚†bÂ’’Óâ€¢Ç7â¶W“×¶—Ò6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓãR&÷VæFVBÖÆr&r×7W&f6RÓ‚Ó"’ÓFW‡B×‡2F&³¦&r×7W&f6RÓƒ#à¢	ù8B¶bææÖWĞ¢Æ'WGFöâöä6Æ–6³×²‚’Óâ6WDf–ÆTÖWF‚‡’Óâæf–ÇFW"‚…òÂ¢’Óâ¢ÓÒ–’’—Ò6Æ74æÖSÒ'FW‡B×7W&f6RÓC†÷fW#§FW‡B×&VBÓS#î)ÉSÂö'WGFöãà¢Â÷7ãà¢’—Ğ¢Ç7â6Æ74æÖSÒ'6VÆbÖ6VçFW"FW‡BÕ³…ÒFW‡B×7W&f6RÓC#äf–ÆR–çFVÆÆ–vVæ6R'&—fW2–â†6R#Â÷7ãà¢ÂöF—cà¢—Ğ¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2ÖVæBvÓ"&÷VæFVB×†Â&÷&FW"&÷&FW"×7W&f6RÓ#&r×v†—FR‚Ó2’Ó"6†F÷r×6ögBF&³¦&÷&FW"×7W&f6RÓsF&³¦&r×7W&f6RÓ“S#à¢ÆÆ&VÂ6Æ74æÖSÒ&–6öâÖ'Fâ6‡&–æ²Ó7W'6÷"×ö–çFW""F—FÆSÒ$GF6‚#à¢	ù8à¢Æ–çW@¢G—SÒ&f–ÆR ¢×VÇF—ÆP¢6Æ74æÖSÒ&†–FFVâ ¢öä6†ævS×²†R’ÓâRçF&vWBæf–ÆW2bböäf–ÆW2†RçF&vWBæf–ÆW2—Ğ¢óà¢ÂöÆ&VÃà¢ÇFW‡F&V¢6Æ74æÖSÒ&Ö‚Ö‚ÓCÖ–âÖ‚Õ³#G…ÒfÆW‚Ó&W6—¦RÖæöæR&r×G&ç7&VçB’ÓFW‡B×6Ò÷WFÆ–æRÖæöæRÆ6V†öÆFW#§FW‡B×7W&f6RÓC ¢Æ6V†öÆFW#Ò$ÖW76vR7–æ6^(
b„VçFW"Fò6VæBÂ6†–gB´VçFW"f÷"æWvÆ–æR’ ¢&÷w3×³Ğ¢fÇVS×¶–çWGĞ¢öä6†ævS×²†R’Óâ°¢6WD–çWB†RçF&vWBçfÇVR“°¢RçF&vWBç7G–ÆRæ†V–v‡BÒvWFòs°¢RçF&vWBç7G–ÆRæ†V–v‡BÒÖF‚æÖ–â†RçF&vWBç67&öÆÄ†V–v‡BÂc’²w‚s°¢×Ğ¢öä¶W”F÷vã×²†R’Óâ°¢–b†Ræ¶W’ÓÓÒtVçFW"rbbRç6†–gD¶W’’°¢Rç&WfVçDFVfVÇB‚“°¢6VæB‚“°¢Ğ¢×Ğ¢óà¢·7G&VÖ–ærò€¢Æ'WGFöâöä6Æ–6³×·7F÷Ò6Æ74æÖSÒ&'FâÖ÷WFÆ–æR6‡&–æ²Ó‚Ó2’ÓãRFW‡B×6Ò#î)j7F÷Âö'WGFöãà¢’’¢€¢Æ'WGFöà¢öä6Æ–6³×²‚’Óâ6VæB‚—Ğ¢F—6&ÆVC×²–çWBçG&–Ò‚’bb–ÖvW2æÆVæwF‡Ğ¢6Æ74æÖSÒ&'Fâ×&–Ö'’6‡&–æ²Ó‚Ó2’ÓãRFW‡B×6Ò ¢óà¢(i6Væ@¢Âö'WGFöãà¢—Ğ¢ÂöF—cà¢Ç6Æ74æÖSÒ&×BÓãRFW‡BÖ6VçFW"FW‡BÕ³…ÒFW‡B×7W&f6RÓC#à¢’6âÖ¶RÖ—7F¶W2âfW&–g’–×÷'FçB–æf÷&ÖF–öâà¢Â÷à¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢“°§Ğ ¦gVæ7F–öâV×G•7FFR‚’°¢&WGW&â€¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"’Ó#FW‡BÖ6VçFW"#à¢Ç7frv–GFƒÒ#C‚"†V–v‡CÒ#C‚"f–Wt&÷ƒÒ#3"3""6Æ74æÖSÒ&Ö"ÓB÷6—G’Óƒ#à¢Æ6—&6ÆR7ƒÒ#b"7“Ò#b"#Ò#2"f–ÆÃÒ&æöæR"7G&ö¶SÒ"333sVfb"7G&ö¶R×v–GFƒÒ#"ãR"óà¢Æ6—&6ÆR7ƒÒ#b"7“Ò#b"#Ò#R"f–ÆÃÒ"333sVfb"óà¢Â÷7fsà¢Æƒ"6Æ74æÖSÒ'FW‡B×†ÂföçB×6VÖ–&öÆBG&6¶–ær×F–v‡B#ä†÷r6â’†VÇ–÷RFöF“óÂöƒ#à¢Ç6Æ74æÖSÒ&×BÓ"Ö‚×r×6ÒFW‡B×6ÒFW‡B×7W&f6RÓS#à¢6²ç—F†–ærÂWÆöB–ÖvW2f÷"æÇ—6—2Â÷"7F'B&W6V&6‚F‡&VBâ7v—F6‚ÖöFVÇ2ç—F–ÖRà¢Â÷à¢ÆF—b6Æ74æÖSÒ&×BÓbw&–Bw&–BÖ6öÇ2ÓvÓ"6Ó¦w&–BÖ6öÇ2Ó"#à¢µ²u7VÖÖ&—¦R6öçG&7Bf÷"ÖRrÂtæÇ—6RF†—27&VG6†VWBrÂtG&gB&ö¦V7B&÷÷6ÂrÂtW‡Æ–â6öæ6WB6–×Ç’uÒæÖ‚‡2’Óâ€¢ÆF—b¶W“×·7Ò6Æ74æÖSÒ&6&B‚ÓB’Ó2FW‡BÖÆVgBFW‡B×6ÒFW‡B×7W&f6RÓS#ç·7ÓÂöF—cà¢’—Ğ¢ÂöF—cà¢ÂöF—cà¢“°§Ğ ¦gVæ7F–öâÖW76vT'V&&ÆR‡°¢×6rÀ¢—4Æ7BÀ¢7G&VÖ–ærÀ¢öä'&æ6‚À¢öå&VvVæW&FRÀ§Ó¢°¢×6s¢ÖW76vS°¢—4Æ7C¢&ööÆVã°¢7G&VÖ–æs¢&ööÆVã°¢öä'&æ6ƒ¢‚’Óâfö–C°¢öå&VvVæW&FSó¢‚’Óâfö–C°§Ò’°¢6öç7B—5W6W"Ò×6rç&öÆRÓÓÒwW6W"s°¢&WGW&â€¢ÆF—b6Æ74æÖSÒ&Ö"Óbæ–ÖFRÖfFR×W#à¢ÆF—b6Æ74æÖSÒ&Ö"ÓãRfÆW‚—FV×2Ö6VçFW"vÓ"FW‡B×‡2FW‡B×7W&f6RÓC#à¢Ç7â6Æ74æÖS×¶fÆW‚‚ÓbrÓb—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖgVÆÂFW‡BÕ³…ÒföçBÖÖVF—VÒG¶—5W6W"òv&r×7W&f6RÓ#F&³¦&r×7W&f6RÓƒr¢v&rÖ66VçBÓcFW‡B×v†—FRwÖà¢¶—5W6W"òu–÷Rr¢u2wĞ¢Â÷7ãà¢Ç7ãç¶—5W6W"òu–÷Rr¢×6yµ½‘•°ñğ€ÍÍ¥ÍÑ…¹Ğôğ½ÍÁ…¸ø(€€€€€€€€€€€íÍÑÉ•…µ¥¹œ€˜˜€ñÍÁ…¸±…ÍÍ9…µ”ô‰¥¹±¥¹”µ™±•à ´ÌÜ´Ì…¹¥µ…Ñ”µÍÁ¥¸É½Õ¹‘•µ™Õ±°‰½É‘•È´È‰½É‘•Èµ…•¹Ğ´ĞÀÀ‰½É‘•ÈµĞµÑÉ…¹ÍÁ…É•¹Ğˆ€¼ùô(€€€€€€ğ½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”õíÁ°´à€‘í¥ÍUÍ•È€ü€œœ€è€œõôø(€€€€€€€í¥ÍUÍ•È€ü€ (€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰İ¡¥Ñ•ÍÁ…”µÁÉ”µİÉ…ÀÑ•áĞµ±lÄÕÁát±•…‘¥¹œ´ÜˆùíµÍœ¹½¹Ñ•¹Ñôğ½‘¥Øø(€€€€€€€€¤€è€ (€€€€€€€€€€ñ5…É­‘½İ¸½¹Ñ•¹ĞõíµÍœ¹½¹Ñ•¹Ğñğ€¡ÍÑÉ•…µ¥¹œ€ü€ŸŠˆœ€è€œœ¥ô€¼ø(€€€€€€€€€€¥ô(€€€€€€ğ½‘¥Øø(€€€€€ì¼¨…Ñ¥½¹Ì€¨½ô(€€€€€€„…ÍÑÉ•…µ¥¹œ€˜˜µÍœ¹½¹Ñ•¹Ğ€˜˜€ (€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µĞ´Ä¸Ô™±•à¥Ñ•µÌµ•¹Ñ•È…À´ÄÁ°´à½Á…¥Ñä´ÀÑÉ…¹Í¥Ñ¥½¸µ½Á…¥ÑäÉ½ÕÀµ¡½Ù•Èé½Á…¥Ñä´ÄÀÀˆÍÑå±”õíì½Á…¥Ñäè€Äõôø(€€€€€€€€€€ñ½Áå	ÕÑÑ½¸Ñ•áĞõíµÍœ¹½¹Ñ•¹Ñô€¼ø(€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õí½¹	É…¹¡ô±…ÍÍ9…µ”ô‰‰Ñ¸µ¡½ÍĞÁà´ÈÁä´ÄÑ•áĞµáÌˆÑ¥Ñ±”ô‰	É…¹ ™É½´¡•É”ˆûÂ~2ü	É…¹ ğ½‰ÕÑÑ½¸ø(€€€€€€€€€í½¹I••¹•É…Ñ”€˜˜€ñ‰ÕÑÑ½¸½¹±¥¬õí½¹I••¹•É…Ñ•ô±…ÍÍ9…µ”ô‰‰Ñ¸µ¡½ÍĞÁà´ÈÁä´ÄÑ•áĞµáÌˆÑ¥Ñ±”ô‰I••¹•É…Ñ”ˆûŠÜI••¹•É…Ñ”ğ½‰ÕÑÑ½¸ùô(€€€€€€€€ğ½‘¥Øø(€€€€€€¥ô(€€€€€ì¼¨…ÍÍ¥ÍÑ…¹Ğµ•Ñ„€¨½ô(€€€€€ì…¥ÍUÍ•È€˜˜€…ÍÑÉ•…µ¥¹œ€˜˜€¡µÍœ¹Ñ½­•¹Í}¥¸ñğµÍœ¹Ñ½­•¹Í}½ÕĞ¤€˜˜€ (€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µĞ´ÄÁ°´àÑ•áĞµmlÄÁÁátÑ•áĞ·W7W&f6RÓC#à¢¶×6rçFö¶Vç5ö–âòG¶f÷&ÖEFö¶Vç2†×6rçFö¶Vç5ö–â—Ò–æ¢rwÒ¶×6rçFö¶Vç5ö÷WBò+RG¶f÷&ÖEFö¶Vç2†×6rçFö¶Vç5ö÷WB—Ò÷WF¢rwĞ¢¶×6ræ6÷7E÷W6Bò+RG¶×6ræ6÷7E÷W6BçFôf—†VBƒB—Ö¢rwĞ¢¶×6ræÖöFVÂò+RG¶×6ræÖöFVÇÖ¢rwĞ¢ÂöF—cà¢—Ğ¢ÂöF—cà¢“°§Ğ