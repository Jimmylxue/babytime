import { View, Text, Input, Picker, Image } from '@tarojs/components';
import Taro, { useRouter, useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { useBabyStore } from '../../stores/babyStore';
import { babyApi } from '../../utils/request';
import { chooseAndUploadImage } from '../../utils/upload';
import './index.scss';

export default function BabyEditPage() {
  const router = useRouter();
  const { babyId } = router.params;
  const isEdit = !!babyId;
  const { addBaby, updateBaby, babies } = useBabyStore();

  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [birthday, setBirthday] = useState('');
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(false);

  useDidShow(() => {
    if (isEdit && babyId) {
      const baby = babies.find((b) => b.id === babyId);
      if (baby) {
        setName(baby.name);
        setGender(baby.gender);
        setBirthday(baby.birthday);
        setAvatar(baby.avatar || '');
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
      setAvatar(baby.avatar || '');
    } catch (error) {
      Taro.showToast({ title: '获取信息失败', icon: 'none' });
    }
  };

  const handleChooseAvatar = async () => {
    const imageUrl = await chooseAndUploadImage();
    if (imageUrl) {
      setAvatar(imageUrl);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Taro.showToast({ title: '请输入宝贝名字', icon: 'none' });
      return;
    }
    if (!birthday) {
      Taro.showToast({ title: '请选择出生日期', icon: 'none' });
      return;
    }

    setLoading(true);
    try {
      const data = {
        name: name.trim(),
        gender,
        birthday,
        avatar,
      };

      if (isEdit) {
        await updateBaby(babyId, data);
        Taro.showToast({ title: '更新成功', icon: 'success' });
      } else {
        await addBaby(data);
        Taro.showToast({ title: '添加成功', icon: 'success' });
      }

      setTimeout(() => Taro.navigateBack(), 1500);
    } catch (error) {
      Taro.showToast({ title: isEdit ? '更新失败' : '添加失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  const onDateChange = (e) => {
    setBirthday(e.detail.value);
  };

  return (
    <View className="edit-page">
      {/* 头像选择 */}
      <View className="avatar-section" onClick={handleChooseAvatar}>
        <View className="avatar-wrapper">
          {avatar ? (
            <Image className="avatar-img" src={avatar} mode="aspectFill" />
          ) : (
            <View className={`avatar-placeholder ${gender}`}>
              <Text className="avatar-icon">{gender === 'male' ? '👦' : '👧'}</Text>
            </View>
          )}
          <View className="avatar-badge">
            <Text className="badge-icon">📷</Text>
          </View>
        </View>
        <Text className="avatar-tip">点击设置头像</Text>
      </View>

      {/* 表单 */}
      <View className="form-card">
        <View className="form-group">
          <Text className="form-label">宝贝名字</Text>
          <Input
            className="form-input"
            placeholder="请输入宝贝名字"
            value={name}
            onInput={(e) => setName(e.detail.value)}
          />
        </View>

        <View className="form-group">
          <Text className="form-label">性别</Text>
          <View className="gender-select">
            <View
              className={`gender-option ${gender === 'male' ? 'active' : ''}`}
              onClick={() => setGender('male')}
            >
              <Text className="gender-icon">👦</Text>
              <Text>男宝</Text>
            </View>
            <View
              className={`gender-option ${gender === 'female' ? 'active' : ''}`}
              onClick={() => setGender('female')}
            >
              <Text className="gender-icon">👧</Text>
              <Text>女宝</Text>
            </View>
          </View>
        </View>

        <View className="form-group">
          <Text className="form-label">出生日期</Text>
          <Picker mode="date" onChange={onDateChange}>
            <View className="form-input date-picker">
              <Text className={birthday ? '' : 'placeholder'}>
                {birthday || '请选择出生日期'}
              </Text>
            </View>
          </Picker>
        </View>
      </View>

      {/* 提交按钮 */}
      <View className="submit-btn" onClick={handleSubmit}>
        <Text className="submit-text">
          {loading ? '保存中...' : isEdit ? '保存修改' : '确认添加'}
        </Text>
      </View>
    </View>
  );
}
