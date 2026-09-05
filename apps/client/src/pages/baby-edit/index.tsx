import { View, Text, Input, Picker, Image } from '@tarojs/components';
import Taro, { useRouter, useDidShow } from '@tarojs/taro';
import { useState, useMemo, useRef } from 'react';
import { useBabyStore } from '../../stores/babyStore';
import { babyApi, recordApi, uploadFile, trackEvent } from '../../utils/request';
import { chooseAndUploadImage } from '../../utils/upload';
import { API_BASE } from '../../config/env';
import { markAutoRedirectedToOnboarding } from '../../utils/onboarding';
import editIllustration from '../../assets/edit-illustration.png';
import avatarBoy from '../../assets/avatar-boy.jpg';
import avatarGirl from '../../assets/avatar-girl.jpg';
import cameraPinkIcon from '../../assets/icons/camera-pink.svg';
import calendarPinkIcon from '../../assets/icons/calendar-pink.svg';
import scaleGrayIcon from '../../assets/icons/scale-gray.svg';
import rulerGrayIcon from '../../assets/icons/ruler-gray.svg';
import './index.scss';

// 预设头像（男宝/女宝）：avatar 状态存 'preset:xxx' 标记，保存时落成真实 URL
const PRESET_AVATARS = [
	{ key: 'boy', src: avatarBoy, gender: 'male' as const },
	{ key: 'girl', src: avatarGirl, gender: 'female' as const },
];

const presetSrc = (key: string) =>
  PRESET_AVATARS.find((p) => p.key === key)?.src || avatarBoy;

// 预设头像落库：包内资源无远程 URL，读文件写临时文件后走上传
const uploadPresetAvatar = async (key: string): Promise<string> => {
  const src = presetSrc(key);
  const fs = Taro.getFileSystemManager();
  const tempPath = `${Taro.env.USER_DATA_PATH}/preset-avatar-${key}.jpg`;
  try {
    if (src.startsWith('data:')) {
      fs.writeFileSync(tempPath, src.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    } else {
      const b64 = fs.readFileSync(src, 'base64');
      fs.writeFileSync(tempPath, b64, 'base64');
    }
    const res = await uploadFile(tempPath);
    return res.url.startsWith('http') ? res.url : `${API_BASE}${res.url}`;
  } catch (error) {
    console.error('预设头像上传失败', error);
    return '';
  }
};

export default function BabyEditPage() {
  const router = useRouter();
  const { babyId } = router.params;
  const isEdit = !!babyId;
  const { addBaby, updateBaby, babies } = useBabyStore();

  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [birthday, setBirthday] = useState('');
  const [avatar, setAvatar] = useState('preset:boy');
  // 已上传的自定义照片：与「选中」解耦，切回预设后照片格保留
  const [customPhoto, setCustomPhoto] = useState('');
  const [birthWeight, setBirthWeight] = useState('');
  const [birthHeight, setBirthHeight] = useState('');
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false); // 同步锁，避免 state 异步更新导致连点漏拦截
  const createdRef = useRef(false);

  // 本页承担原 onboarding 职责：进过即标记，返回首页不再循环跳回（幂等）
  markAutoRedirectedToOnboarding();

  // 自定义导航：返回按钮与微信胶囊同带对称
  const [menuBand] = useState(() => {
    let top = (Taro.getSystemInfoSync().statusBarHeight || 20) + 4;
    let height = 32;
    let leftInset = 10;
    try {
      const menu = Taro.getMenuButtonBoundingClientRect();
      if (menu && menu.height) {
        const si = Taro.getSystemInfoSync();
        top = menu.top;
        height = menu.height;
        leftInset = Math.max(6, si.windowWidth - menu.right);
      }
    } catch (error) {
      // 取不到胶囊信息时用默认值
    }
    return { top, height, leftInset };
  });

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  useDidShow(() => {
    // 创建后去记了一笔，返回本页时直接进首页（原 onboarding 行为）
    if (createdRef.current) {
      Taro.switchTab({ url: '/pages/index/index' });
      return;
    }
    if (isEdit && babyId) {
      const baby = babies.find((b) => b.id === babyId);
      if (baby) {
        setName(baby.name);
        setGender(baby.gender);
        setBirthday(baby.birthday);
        setAvatar(baby.avatar || 'preset:boy');
        if (baby.avatar) setCustomPhoto(baby.avatar);
      } else {
        fetchBaby();
      }
    }
  });

  const fetchBaby = async () => {
    try {
      const res = await babyApi.getOne(babyId);
      const baby = res.data;
      setName(baby.name);
      setGender(baby.gender);
      setBirthday(baby.birthday);
      setAvatar(baby.avatar || 'preset:boy');
      if (baby.avatar) setCustomPhoto(baby.avatar);
    } catch (error) {
      Taro.showToast({ title: '获取信息失败', icon: 'none' });
    }
  };

  const handleChooseAvatar = async () => {
    const imageUrl = await chooseAndUploadImage();
    if (imageUrl) {
      // 重复上传只替换「我的照片」这一格，并自动选中
      setCustomPhoto(imageUrl);
      setAvatar(imageUrl);
    }
  };

  // 切换性别：未上传自定义照片时，默认头像跟随性别；已上传则不动
  const handleGenderChange = (next: 'male' | 'female') => {
    setGender(next);
    if (avatar.startsWith('preset:')) {
      setAvatar(next === 'male' ? 'preset:boy' : 'preset:girl');
    }
  };

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack();
    } else {
      // 从分享卡/登录直进（无页面栈），回首页兜底
      Taro.switchTab({ url: '/pages/index/index' });
    }
  };

  // 创建/保存后的返回：无页面栈时回首页
  const safeBack = () => {
    if (Taro.getCurrentPages().length > 1) {
      Taro.navigateBack();
    } else {
      Taro.switchTab({ url: '/pages/index/index' });
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Taro.showToast({ title: '请输入宝贝昵称', icon: 'none' });
      return;
    }
    if (!birthday) {
      Taro.showToast({ title: '请选择出生日期', icon: 'none' });
      return;
    }
    if (birthday > today) {
      Taro.showToast({ title: '出生日期不能晚于今天', icon: 'none' });
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;

    setLoading(true);
    try {
      // 预设头像：落成真实 URL（失败则留空，走性别默认头像）
      let avatarToSave = avatar;
      if (avatarToSave.startsWith('preset:')) {
        avatarToSave = await uploadPresetAvatar(avatarToSave.slice(7));
      }

      const data = {
        name: name.trim(),
        gender,
        birthday,
        avatar: avatarToSave,
      };

      if (isEdit) {
        await updateBaby(babyId, data);
        Taro.showToast({ title: '更新成功', icon: 'success' });
        setTimeout(() => safeBack(), 1500);
      } else {
        const baby = await addBaby(data);
        createdRef.current = true;
        void trackEvent('baby_created', { source: 'onboarding', babyId: baby.id });

        // 出生信息（可选）：保存为首条身高体重记录
        const w = parseFloat(birthWeight);
        const h = parseFloat(birthHeight);
        if (Number.isFinite(w) || Number.isFinite(h)) {
          const record: Record<string, unknown> = {
            babyId: baby.id,
            type: 'height_weight',
            startTime: new Date().toISOString(),
          };
          if (Number.isFinite(w)) record.weight = w;
          if (Number.isFinite(h)) record.height = h;
          await recordApi.create(record).catch(() => undefined);
        }

        // 创建成功：引导记录第一条（原 onboarding 流程）
        const res = await Taro.showModal({
          title: '宝宝档案建好啦 🎉',
          content: '现在记录第一条吗？比如一次喂奶或换尿布',
          confirmText: '记一笔',
          cancelText: '稍后再说',
        });
        if (res.confirm) {
          Taro.navigateTo({
            url: `/pages/record/index?type=feeding&babyId=${baby.id}`,
          });
        } else {
          safeBack();
        }
      }
    } catch (error) {
      Taro.showToast({ title: isEdit ? '更新失败' : '添加失败', icon: 'none' });
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const onDateChange = (e) => {
    setBirthday(e.detail.value);
  };

  return (
    <View className="edit-page">
      {/* 返回按钮：与微信胶囊同带对称、fixed 不随滚动 */}
      <View
        className="edit-back"
        style={{
          top: `${menuBand.top}px`,
          left: `${menuBand.leftInset}px`,
          width: `${menuBand.height}px`,
          height: `${menuBand.height}px`,
        }}
        onClick={handleBack}
      >
        <Text className="edit-back-icon">‹</Text>
      </View>

      {/* 顶部：标题区 + 插画 */}
      <View className="edit-header">
        <View className="edit-header-copy">
          <Text className="edit-title">{isEdit ? '编辑宝宝' : '创建宝宝'}</Text>
          <Text className="edit-subtitle">完善宝宝信息，开启科学育儿之旅</Text>
        </View>
        <Image className="edit-illustration" src={editIllustration} mode="aspectFit" />
      </View>

      {/* 宝宝头像 */}
      <View className="edit-card">
        <View className="edit-label-row">
          <View className="edit-label-dot" />
          <Text className="edit-label">宝宝头像</Text>
        </View>
        <View className="avatar-row">
          <View className="avatar-upload" onClick={handleChooseAvatar}>
            <View className="avatar-upload-circle">
              <Image className="avatar-upload-icon" src={cameraPinkIcon} />
            </View>
            <Text className="avatar-upload-text">上传照片</Text>
          </View>
          {PRESET_AVATARS.map((preset) => {
            const active = avatar === `preset:${preset.key}`;
            return (
              <View
                key={preset.key}
                className={`avatar-option${active ? ' active' : ''}`}
                onClick={() => {
                  setAvatar(`preset:${preset.key}`);
                  setGender(preset.gender);
                }}
              >
                <Image className="avatar-option-img" src={preset.src} mode="aspectFill" />
                {active && (
                  <View className="avatar-check">
                    <Text className="avatar-check-icon">✓</Text>
                  </View>
                )}
              </View>
            );
          })}
          {/* 我的照片：上传后常驻一格（切回预设也不消失），重复上传只替换此格 */}
          {customPhoto !== '' && (
            <View
              className={`avatar-option${avatar === customPhoto ? ' active' : ''}`}
              onClick={() => setAvatar(customPhoto)}
            >
              <Image className="avatar-option-img" src={customPhoto} mode="aspectFill" />
              {avatar === customPhoto && (
                <View className="avatar-check">
                  <Text className="avatar-check-icon">✓</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>

      {/* 宝宝昵称 */}
      <View className="edit-card">
        <View className="edit-label-row">
          <View className="edit-label-dot" />
          <Text className="edit-label">宝宝昵称</Text>
        </View>
        <View className="nickname-input-wrap">
          <Input
            className="nickname-input"
            placeholder="请输入宝宝昵称"
            placeholderClass="nickname-placeholder"
            value={name}
            maxlength={10}
            onInput={(e) => setName(e.detail.value)}
          />
          <Text className="nickname-count">{name.length}/10</Text>
        </View>
      </View>

      {/* 宝宝性别 */}
      <View className="edit-card">
        <View className="edit-label-row">
          <View className="edit-label-dot" />
          <Text className="edit-label">宝宝性别</Text>
        </View>
        <View className="gender-row">
          <View
            className={`gender-option${gender === 'male' ? ' active' : ''}`}
            onClick={() => handleGenderChange('male')}
          >
            <Image className="gender-thumb" src={avatarBoy} mode="aspectFill" />
            <Text className={`gender-text${gender === 'male' ? ' active' : ''}`}>男孩</Text>
          </View>
          <View
            className={`gender-option${gender === 'female' ? ' active' : ''}`}
            onClick={() => handleGenderChange('female')}
          >
            <Image className="gender-thumb" src={avatarGirl} mode="aspectFill" />
            <Text className={`gender-text${gender === 'female' ? ' active' : ''}`}>女孩</Text>
          </View>
        </View>
      </View>

      {/* 出生日期 */}
      <View className="edit-card">
        <View className="edit-label-row">
          <View className="edit-label-dot" />
          <Text className="edit-label">出生日期</Text>
        </View>
        <Picker mode="date" end={today} onChange={onDateChange} value={birthday || today}>
          <View className="date-field">
            <Image className="date-field-icon" src={calendarPinkIcon} />
            <Text className={`date-field-text${birthday ? '' : ' placeholder'}`}>
              {birthday || '选择出生日期'}
            </Text>
            <Text className="date-field-arrow">›</Text>
          </View>
        </Picker>
      </View>

      {/* 出生信息（可选） */}
      <View className="edit-card">
        <View className="edit-label-row">
          <View className="edit-label-dot" />
          <Text className="edit-label">出生信息（可选）</Text>
        </View>
        <View className="birth-info-row">
          <View className="birth-info-field">
            <Image className="birth-info-icon" src={scaleGrayIcon} />
            <Input
              className="birth-info-input"
              type="digit"
              placeholder="体重（kg）"
              placeholderClass="birth-info-placeholder"
              value={birthWeight}
              onInput={(e) => setBirthWeight(e.detail.value)}
            />
          </View>
          <View className="birth-info-field">
            <Image className="birth-info-icon" src={rulerGrayIcon} />
            <Input
              className="birth-info-input"
              type="digit"
              placeholder="身高（cm）"
              placeholderClass="birth-info-placeholder"
              value={birthHeight}
              onInput={(e) => setBirthHeight(e.detail.value)}
            />
          </View>
        </View>
      </View>

      {/* 保存按钮 */}
      <View className="edit-submit" onClick={handleSubmit}>
        <Text className="edit-submit-text">
          {loading ? '保存中...' : isEdit ? '保存修改' : '保存并开始记录'}
        </Text>
      </View>
    </View>
  );
}
